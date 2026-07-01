// ============================================================
// App.tsx — componente raiz do bolão.
//
// Responsabilidades:
//  - Autenticação (Supabase Auth: nome -> nome@bolao.app) e telas login/splash/app.
//  - Carregar e manter sincronizados (Supabase Realtime) jogos, apostas,
//    lançamentos, palpites especiais e fiados.
//  - Regras de janela de aposta (editável até 1 min antes do kickoff) e o
//    conceito de "rodada" (jogos de madrugada entram na rodada do dia anterior).
//  - Renderizar a aba de Partidas/Apostas; Ranking, Palpites e Pagamento são
//    componentes carregados sob demanda (lazy).
// A validação que vale dinheiro (lockout das apostas) é refeita no servidor
// pela RPC submit_bets — o cliente só faz a checagem otimista.
// ============================================================
import { useState, useEffect, useMemo, useRef, useCallback, lazy, Suspense, Fragment } from 'react';
import { Trophy, Calendar, Wallet, ListChecks, ChevronDown, ChevronUp, User, Clover, Clock, ArrowUp, ArrowDown, Network, LogIn } from 'lucide-react';
import type { Match, Bet, Participant, ParticipantStanding, SpecialPrediction, BrazilStage, Debt, MatchGoal, ThiefSteal, Challenge } from './types';
import { BRAZIL_PLAYERS, goalsByPlayer } from './utils/players';
import { calculateStandings, analyzeBet, pensBonus, isProfeta, predictedAdvancer, calculateThiefRounds } from './utils/rules';
import { calcAccumulatedPot } from './utils/pot';
// Abas carregadas sob demanda (code-splitting): só baixam o JS — inclusive o
// WebGL do Ranking (ogl) — quando o usuário abre a aba, deixando o boot mais leve.
const StandingsTable = lazy(() => import('./components/StandingsTable'));
const PixTab = lazy(() => import('./components/PixTab'));
const PalpitesTab = lazy(() => import('./components/PalpitesTab'));
const ProfileTab = lazy(() => import('./components/ProfileTab'));
const BracketTab = lazy(() => import('./components/BracketTab'));
import { PixKeyRow, PIX_RECIPIENT, PIX_BANK } from './components/PixKeyCopy';
import { supabase } from './lib/supabase';
import { translateTeam, mapFifaCode, flagOf, groupLabel, flagSrc, getTeamColors } from './lib/teamMaps';

// Fuso horário de exibição: todos os horários dos jogos são convertidos para Brasília
const TZ = 'America/Sao_Paulo';

const isBrazilMatch = (m: { homeTeamEn: string; awayTeamEn: string }) =>
  m.homeTeamEn === 'Brazil' || m.awayTeamEn === 'Brazil';

const brTimeFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
const isoDateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const brHourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' });

// Jogos de madrugada (kickoff entre 00h e 08h de Brasília) pertencem à
// RODADA DO DIA ANTERIOR: dá para apostar junto com os jogos da tarde/noite
// (ex.: jogo 01h de 17/06 entra na mesma sessão de lançamento de 16/06).
const MADRUGADA_ATE_HORA = 8;

const isoMinusOneDay = (iso: string): string => {
  const dt = new Date(`${iso}T12:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
};

// Dia da rodada (sessão de apostas) a que um jogo pertence (YYYY-MM-DD, Brasília)
const bettingDayIso = (utcDate: string): string => {
  const d = new Date(utcDate);
  const calendarIso = isoDateFmt.format(d);
  const hour = parseInt(brHourFmt.format(d), 10);
  return hour < MADRUGADA_ATE_HORA ? isoMinusOneDay(calendarIso) : calendarIso;
};

// Início (ms) de um dia de Brasília — UTC-3 fixo (sem horário de verão desde 2019)
const startOfBrDay = (iso: string): number => Date.parse(`${iso}T00:00:00-03:00`);

// O kickoff vem em UTC (ISO 8601) direto do banco — sem ambiguidade de fuso.
// Jogo ainda não começou?
const isGameInFuture = (kickoff: string, now: number): boolean => {
  if (!kickoff) return false;
  return now < Date.parse(kickoff);
};

// Pode apostar/editar até 1 minuto antes do início do jogo
const BET_LOCKOUT_MS = 60 * 1000;
const isBettable = (kickoff: string, now: number): boolean => {
  if (!kickoff) return false;
  return now < Date.parse(kickoff) - BET_LOCKOUT_MS;
};

// Data de hoje no horário de Brasília (YYYY-MM-DD)
const getTodayIso = (): string => isoDateFmt.format(new Date());

// Traduz o relógio/etapa ao vivo vindo da ESPN para PT-BR.
// Ex.: "HT"/"Halftime" -> "Intervalo"; demais valores ("28'", etc.) ficam como vieram.
const formatLiveClock = (clock?: string | null): string | null => {
  if (!clock) return null;
  const normalized = clock.trim().toUpperCase();
  if (normalized === 'HT' || normalized === 'HALFTIME' || normalized === 'HALF TIME') {
    return 'Intervalo';
  }
  return clock;
};

// Linha crua da tabela `bets` do Supabase
interface BetRow {
  user_id: string;
  match_id: number;
  home_score: number;
  away_score: number;
  scorer_id?: string | null;
  pens_pick?: boolean | null;
  pens_winner?: string | null;
}

// Linha crua da tabela `matches` do Supabase
interface MatchDbRow {
  id: number;
  utc_date: string;
  status: string;
  stage: string | null;
  group_name: string | null;
  home_team: string;
  away_team: string;
  home_tla: string;
  away_tla: string;
  home_crest: string;
  away_crest: string;
  home_score: number | null;
  away_score: number | null;
  home_pens: number | null;
  away_pens: number | null;
  winner: 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null;
  duration: string | null;
  live_clock: string | null;
  goals: MatchGoal[] | null;
}

// Converte uma linha da tabela `matches` do Supabase para o formato do app
const mapRowToMatch = (r: MatchDbRow): Match => {
  const d = new Date(r.utc_date);
  // Jogos de madrugada caem na rodada do dia anterior (ver bettingDayIso)
  const bDay = bettingDayIso(r.utc_date);
  const bDayLabel = `${bDay.slice(8, 10)}/${bDay.slice(5, 7)}`;
  return {
    id: String(r.id),
    homeTeam: translateTeam(r.home_team),
    awayTeam: translateTeam(r.away_team),
    homeCode: mapFifaCode(r.home_team, r.home_tla),
    awayCode: mapFifaCode(r.away_team, r.away_tla),
    homeFlag: flagOf(r.home_team, r.home_crest),
    awayFlag: flagOf(r.away_team, r.away_crest),
    date: bDayLabel,
    time: brTimeFmt.format(d),
    group: groupLabel(r.stage, r.group_name),
    homeScore: r.home_score ?? null,
    awayScore: r.away_score ?? null,
    homePens: r.home_pens ?? null,
    awayPens: r.away_pens ?? null,
    status: r.status === 'FINISHED' ? 'finished' : 'scheduled',
    kickoff: r.utc_date,
    isoDate: bDay,
    homeTeamEn: r.home_team,
    awayTeamEn: r.away_team,
    stage: r.stage ?? 'GROUP_STAGE',
    winner: r.winner ?? null,
    duration: r.duration ?? null,
    isLive: ['IN_PLAY', 'PAUSED', 'LIVE', 'EXTRA_TIME', 'PENALTY_SHOOTOUT'].includes(r.status?.toUpperCase() || ''),
    liveClock: r.live_clock ?? null,
    goals: r.goals ?? [],
  };
};

const readCachedUser = (): Participant | null => {
  const saved = localStorage.getItem('bolao_current_user');
  if (!saved) return null;
  try {
    const parsed = JSON.parse(saved);
    return parsed?.uid ? parsed : null; // formato antigo (sem uid) é descartado
  } catch {
    return null;
  }
};

const MatchCountdown = ({ kickoff }: { kickoff: string }) => {
  const [timeLeft, setTimeLeft] = useState<string>('');

  useEffect(() => {
    const calculateTime = () => {
      const lockoutTime = Date.parse(kickoff) - 60000; // 1 min before kickoff
      const diff = lockoutTime - Date.now();
      if (diff <= 0) {
        setTimeLeft('EXPIRADO');
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      const hStr = String(hours).padStart(2, '0');
      const mStr = String(minutes).padStart(2, '0');
      const sStr = String(seconds).padStart(2, '0');

      setTimeLeft(`FECHA EM ${hStr}H.${mStr}M.${sStr}S`);
    };

    calculateTime();
    const timer = setInterval(calculateTime, 1000);
    return () => clearInterval(timer);
  }, [kickoff]);

  if (timeLeft === 'EXPIRADO' || !timeLeft) return null;

  return (
    <div className="match-countdown-badge">
      <Clock size={11} className="clock-icon" />
      <span>{timeLeft}</span>
    </div>
  );
};

interface OddsData {
  homePct: number;
  drawPct: number;
  awayPct: number;
}

const ALIAS: Record<string, string> = {
  usa: 'unitedstates',
  unitedstatesofamerica: 'unitedstates',
  korearepublic: 'southkorea',
  iriran: 'iran',
  cotedivoire: 'ivorycoast',
  drcongo: 'congodr',
  democraticrepublicofthecongo: 'congodr',
  capeverdeislands: 'capeverde',
  caboverde: 'capeverde',
  bosniaandherzegovina: 'bosniaherzegovina',
  czechrepublic: 'czechia',
  turkiye: 'turkey',
};

const normName = (s: string): string => {
  const base = (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return ALIAS[base] ?? base;
};

const makePairKey = (teamA: string, teamB: string): string =>
  [normName(teamA), normName(teamB)].sort().join('|');

const parseAmericanOdd = (oddStr: string): number => {
  const odd = parseInt(oddStr, 10);
  if (isNaN(odd)) return 0;
  if (odd > 0) {
    return 100 / (odd + 100);
  } else {
    return -odd / (-odd + 100);
  }
};

const pickMoneylineOdd = (side: any): string | number | null =>
  side?.current?.odds ?? side?.close?.odds ?? side?.open?.odds ?? null;

const normalizeProbabilities = (home: number, draw: number, away: number): OddsData | null => {
  const sum = home + draw + away;
  if (sum <= 0) return null;

  const homePct = Math.round((home / sum) * 100);
  const awayPct = Math.round((away / sum) * 100);
  const drawPct = 100 - homePct - awayPct;

  return { homePct, drawPct, awayPct };
};

const parseEspnOdds = (odds: any): OddsData | null => {
  const moneyline = odds?.moneyline;
  if (!moneyline) return null;

  const homeOdd = pickMoneylineOdd(moneyline.home);
  const drawOdd = pickMoneylineOdd(moneyline.draw);
  const awayOdd = pickMoneylineOdd(moneyline.away);
  if (homeOdd == null || drawOdd == null || awayOdd == null) return null;

  return normalizeProbabilities(
    parseAmericanOdd(String(homeOdd)),
    parseAmericanOdd(String(drawOdd)),
    parseAmericanOdd(String(awayOdd))
  );
};

const collectEspnOdds = (data: any): Record<string, OddsData> => {
  const nextOddsMap: Record<string, OddsData> = {};

  for (const ev of data.events ?? []) {
    const comp = ev.competitions?.[0];
    const home = comp?.competitors?.find((c: any) => c.homeAway === 'home');
    const away = comp?.competitors?.find((c: any) => c.homeAway === 'away');
    const homeName = home?.team?.displayName ?? home?.team?.name ?? '';
    const awayName = away?.team?.displayName ?? away?.team?.name ?? '';
    if (!homeName || !awayName) continue;

    const oddsArray = Array.isArray(comp?.odds) ? comp.odds.filter(Boolean) : [];
    const espnOdds = oddsArray.find((o: any) => o?.provider?.name === 'DraftKings') || oddsArray[0];
    const parsedOdds = parseEspnOdds(espnOdds);
    if (!parsedOdds) continue;

    nextOddsMap[makePairKey(homeName, awayName)] = parsedOdds;
  }

  return nextOddsMap;
};

function App() {
  // 1. Estados de Autenticação e Telas
  const [currentUser, setCurrentUser] = useState<Participant | null>(() => readCachedUser());

  const [currentScreen, setCurrentScreen] = useState<'login' | 'splash' | 'app'>('splash');
  const [splashVideo, setSplashVideo] = useState<'intro' | 'reload'>('reload');
  const splashVideoRef = useRef<HTMLVideoElement | null>(null);

  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');

  // 2. Estados Principais do Bolão
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [betRows, setBetRows] = useState<BetRow[]>([]);
  const [submittedDates, setSubmittedDates] = useState<Set<string>>(new Set());
  const [specialRows, setSpecialRows] = useState<
    { user_id: string; champion_team: string; brazil_stage: BrazilStage }[]
  >([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [thiefSteals, setThiefSteals] = useState<ThiefSteal[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [pendingConfirmChallenge, setPendingConfirmChallenge] = useState<{
    challengedId: string;
    match: Match;
  } | null>(null);
  const [dismissedSteals, setDismissedSteals] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('dismissed_steals') || '[]');
    } catch {
      return [];
    }
  });
  // dismissedChallenges: lido diretamente do localStorage (sem setter — a função de dismiss foi removida)
  const dismissedChallenges: string[] = (() => {
    try {
      return JSON.parse(localStorage.getItem('dismissed_challenges') || '[]');
    } catch {
      return [];
    }
  })();
  const [selectedVictims, setSelectedVictims] = useState<Record<string, string>>({});

  // Modal pós-lançamento com o PIX copia-e-cola (validação da aposta)
  const [showPixModal, setShowPixModal] = useState(false);

  // Estado para os rascunhos de palpites editados inline
  const [draftBets, setDraftBets] = useState<{ [matchId: string]: { homeScore: string, awayScore: string } }>({});

  // Palpite de artilheiro por jogo do Brasil (matchId -> playerId)
  const [scorerDrafts, setScorerDrafts] = useState<{ [matchId: string]: string }>({});

  // Palpite de pênaltis por jogo do mata-mata (matchId -> {vai pra pênalti?, vencedor})
  const [pensDrafts, setPensDrafts] = useState<{ [matchId: string]: { pick: boolean; winner: 'HOME' | 'AWAY' | null } }>({});

  // Estado para controlar quais palpites de jogos estão expandidos
  const [expandedMatches, setExpandedMatches] = useState<Record<string, boolean>>({});

  const toggleMatchExpanded = (matchId: string) => {
    setExpandedMatches((prev) => ({
      ...prev,
      [matchId]: !prev[matchId],
    }));
  };

  const [oddsMap, setOddsMap] = useState<Record<string, OddsData>>({});


  const [expandedScorers, setExpandedScorers] = useState<Record<string, boolean>>({});

  const toggleScorerExpanded = (matchId: string) => {
    setExpandedScorers((prev) => ({
      ...prev,
      [matchId]: !prev[matchId],
    }));
  };

  const [expandedPens, setExpandedPens] = useState<Record<string, boolean>>({});

  const togglePensExpanded = (matchId: string) => {
    setExpandedPens((prev) => ({
      ...prev,
      [matchId]: !prev[matchId],
    }));
  };

  // Só o mata-mata tem disputa de pênaltis.
  const isKnockoutMatch = (m: Match) => m.stage !== 'GROUP_STAGE';

  const hasLiveForOdds = matches.some((m) => m.isLive);

  // Começa true: evita o flash de "Nenhum jogo agendado" antes da primeira carga
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Estado da Navegação Principal (Abas da bottom bar)
  const [activeTab, setActiveTab] = useState<'jogos' | 'chaveamento' | 'palpites' | 'ranking' | 'pix' | 'perfil'>('jogos');

  const switchTab = (tab: 'jogos' | 'chaveamento' | 'palpites' | 'ranking' | 'pix' | 'perfil') => {
    setActiveTab(tab);
  };

  // Data de partidas selecionada manualmente (YYYY-MM-DD, horário de Brasília)
  const [selectedDateState, setSelectedDateState] = useState<string>('');

  // Relógio interno (30s): trava os inputs no T-1min e atualiza o estado dos jogos
  // no kickoff sem o usuário precisar recarregar a página
  const [nowTs, setNowTs] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNowTs(Date.now()), 30000);
    return () => clearInterval(tick);
  }, []);

  // Prefetch das abas de Ranking e Perfil em segundo plano para transição instantânea
  useEffect(() => {
    const prefetchTabs = async () => {
      try {
        await Promise.all([
          import('./components/StandingsTable'),
          import('./components/ProfileTab')
        ]);
      } catch (err) {
        console.warn('Erro no prefetch das abas', err);
      }
    };
    const timer = setTimeout(prefetchTabs, 1500);
    return () => clearTimeout(timer);
  }, []);

  // Timer de fallback para a splash screen inicial ao carregar a página
  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrentScreen((prev) => {
        if (prev === 'splash') {
          return readCachedUser() ? 'app' : 'login';
        }
        return prev;
      });
    }, 2000); // 2 segundos de fallback (reload.mp4 tem 1 segundo)
    return () => clearTimeout(timer);
  }, []);

  // iOS/Safari: o autoplay inline só funciona se a PROPRIEDADE `muted` estiver
  // setada (o React às vezes só seta o atributo). Garantimos via ref e damos um
  // play() explícito. Se o iOS bloquear mesmo assim (ex.: Modo de Baixo Consumo),
  // o timer de fallback acima leva pra tela seguinte — ninguém fica preso.
  useEffect(() => {
    if (currentScreen !== 'splash') return;
    const v = splashVideoRef.current;
    if (!v) return;
    v.muted = true;
    v.defaultMuted = true;
    v.setAttribute('muted', '');
    v.setAttribute('playsinline', '');
    const p = v.play();
    if (p && typeof p.catch === 'function') p.catch(() => { /* autoplay bloqueado — fallback cuida */ });
  }, [currentScreen, splashVideo]);

  // Toast de notificação (substitui os alert() nativos)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const toastTimerRef = useRef<number | undefined>(undefined);

  // Nomes dos meses em português para o carrossel de datas
  const MONTH_NAMES_FULL = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];

  // Touch swipe refs e state para o carrossel de datas (efeito roleta)
  const touchStartX = useRef<number>(0);
  const touchDelta = useRef<number>(0);
  const [dragOffset, setDragOffset] = useState<number>(0);

  const showToast = (message: string, type: 'success' | 'error' = 'error') => {
    window.clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3500);
  };

  const toastEl = toast && (
    <div className={`toast-notification ${toast.type}`} role="status">
      <span className="toast-icon">{toast.type === 'success' ? '✓' : '!'}</span>
      <span>{toast.message}</span>
    </div>
  );

  // Placeholder rápido enquanto o chunk de uma aba (lazy) termina de baixar
  const tabFallback = (
    <div style={{ textAlign: 'center', padding: '2rem', color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>
      Carregando…
    </div>
  );

  // 3. Validar a sessão do Supabase ao abrir o app
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) {
        localStorage.removeItem('bolao_current_user');
        setCurrentUser(null);
        setCurrentScreen('login');
        return;
      }
      const { data: prof } = await supabase
        .from('participants')
        .select('id, username, name, avatar_url')
        .eq('id', session.user.id)
        .single();
      if (prof) {
        const participant: Participant = {
          id: prof.username,
          uid: prof.id,
          name: prof.name,
          avatarUrl: prof.avatar_url,
        };
        localStorage.setItem('bolao_current_user', JSON.stringify(participant));
        setCurrentUser(participant);
        setCurrentScreen((prev) => (prev === 'login' ? 'app' : prev));
      }
    });
  }, []);

  // 4. Carregamento de dados do Supabase
  const loadAll = async (uid: string, withSpinner: boolean) => {
    if (withSpinner) setLoading(true);
    try {
      const [partsRes, matchesRes, betsRes, subsRes, specialsRes, debtsRes, stealsRes, challengesRes] = await Promise.all([
        supabase.from('participants').select('id, username, name, avatar_url').order('username'),
        // Só as colunas que o app usa (ver MatchDbRow) — evita trafegar a linha
        // inteira a cada evento do Realtime, que recarrega ~104 jogos de uma vez.
        supabase
          .from('matches')
          .select(
            'id, utc_date, status, stage, group_name, home_team, away_team, home_tla, away_tla, home_crest, away_crest, home_score, away_score, home_pens, away_pens, winner, duration, live_clock, goals'
          )
          .order('utc_date'),
        supabase.from('bets').select('user_id, match_id, home_score, away_score, scorer_id, pens_pick, pens_winner'),
        supabase.from('submissions').select('bet_date').eq('user_id', uid),
        supabase.from('special_predictions').select('user_id, champion_team, brazil_stage'),
        supabase.from('debts').select('id, user_id, amount, debt_date, created_at'),
        supabase.from('thief_steals').select('id, thief_id, victim_id, round_date, created_at'),
        supabase.from('challenges').select('id, match_id, challenger_id, challenged_id, challenger_pick, challenged_pick, status, created_at'),
      ]);

      const firstError = partsRes.error || matchesRes.error || betsRes.error || subsRes.error;
      if (firstError) throw new Error(firstError.message);

      const loadedParticipants = (partsRes.data ?? []).map((p) => ({
        id: p.username,
        uid: p.id,
        name: p.name,
        avatarUrl: p.avatar_url,
      }));

      setParticipants(loadedParticipants);
      setMatches(((matchesRes.data ?? []) as MatchDbRow[]).map(mapRowToMatch));
      setBetRows((betsRes.data ?? []) as BetRow[]);
      setSubmittedDates(new Set((subsRes.data ?? []).map((s) => s.bet_date)));
      // specials pode falhar se a migration 003 ainda não rodou — não derruba o app
      setSpecialRows((specialsRes.data ?? []) as typeof specialRows);

      if (debtsRes.error) {
        console.error('Erro ao carregar fiados:', debtsRes.error.message);
        setDebts([]);
      } else {
        setDebts(
          (debtsRes.data ?? []).map((d): Debt => ({
            id: d.id,
            userId: d.user_id,
            amount: Number(d.amount),
            debtDate: d.debt_date,
            createdAt: d.created_at,
          }))
        );
      }

      if (stealsRes.error) {
        console.error('Erro ao carregar roubos:', stealsRes.error.message);
        setThiefSteals([]);
      } else {
        setThiefSteals(
          (stealsRes.data ?? []).map((s): ThiefSteal => {
            const thiefPart = loadedParticipants.find((p) => p.uid === s.thief_id);
            const victimPart = loadedParticipants.find((p) => p.uid === s.victim_id);
            return {
              id: s.id,
              thiefId: thiefPart?.id || s.thief_id,
              victimId: victimPart?.id || s.victim_id,
              roundDate: s.round_date,
              createdAt: s.created_at,
            };
          })
        );
      }

      if (challengesRes.error) {
        console.error('Erro ao carregar desafios:', challengesRes.error.message);
        setChallenges([]);
      } else {
        const uidToUser = (uid: string) => loadedParticipants.find((p) => p.uid === uid)?.id || uid;
        const loadedChallenges = (challengesRes.data ?? []).map((c): Challenge => ({
          id: c.id,
          matchId: String(c.match_id),
          challengerId: uidToUser(c.challenger_id),
          challengedId: uidToUser(c.challenged_id),
          challengerPick: c.challenger_pick as 'HOME' | 'AWAY',
          challengedPick: c.challenged_pick as 'HOME' | 'AWAY',
          status: (c.status as 'pending' | 'accepted' | 'declined') ?? 'pending',
          createdAt: c.created_at,
        }));

        setChallenges(loadedChallenges);
      }

      setError(null);
    } catch (err) {
      // Loga o detalhe técnico no console e mostra um aviso genérico na tela
      // (não expõe mensagens internas do banco para o usuário).
      console.error('Erro ao carregar dados do Supabase:', err);
      setError('Não foi possível carregar os dados agora. Verifique sua conexão e recarregue a página.');
    } finally {
      if (withSpinner) setLoading(false);
    }
  };

  useEffect(() => {
    const uid = currentUser?.uid;
    if (!uid) return;

    const initialLoad = async () => {
      // Pede para a Netlify Function atualizar os jogos (ignora se estiver
      // rodando local sem `netlify dev` — o cron do Netlify cobre o resto)
      try {
        await fetch('/.netlify/functions/sync-matches');
      } catch {
        /* sem functions no ambiente local */
      }
      await loadAll(uid, true);
    };

    initialLoad();

    // Atualizações ao vivo via Supabase Realtime. Para as outras tabelas
    // (apostas/lançamentos/fiados) recarrega tudo com debounce. O debounce agrupa
    // as rajadas de eventos (a sincronização atualiza ~104 jogos de uma vez).
    let reloadTimer: number | undefined;
    const scheduleReload = () => {
      window.clearTimeout(reloadTimer);
      reloadTimer = window.setTimeout(() => loadAll(uid, false), 800);
    };

    // Placar AO VIVO instantâneo: em vez de rebuscar tudo do servidor, aplica a
    // própria linha que veio no evento do Realtime direto no estado. O número
    // muda na hora (sem ida extra ao banco) e alivia a carga. Um micro-debounce
    // de 200ms agrupa a rajada do sync completo num único setMatches.
    const pendingMatches = new Map<string, Match>();
    let matchFlushTimer: number | undefined;
    const flushMatches = () => {
      if (pendingMatches.size === 0) return;
      const updates = new Map(pendingMatches);
      pendingMatches.clear();
      setMatches((prev) => {
        const byId = new Map(prev.map((m) => [m.id, m]));
        updates.forEach((m, id) => byId.set(id, m));
        return Array.from(byId.values()).sort(
          (a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff)
        );
      });
    };
    const onMatchChange = (payload: { eventType: string; new: Partial<MatchDbRow> }) => {
      const row = payload.new;
      // DELETE (ou payload sem dados) é raro aqui — cai no reload completo.
      if (payload.eventType === 'DELETE' || row?.id == null) {
        scheduleReload();
        return;
      }
      pendingMatches.set(String(row.id), mapRowToMatch(row as MatchDbRow));
      window.clearTimeout(matchFlushTimer);
      matchFlushTimer = window.setTimeout(flushMatches, 200);
    };

    const channel = supabase
      .channel('bolao-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, onMatchChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bets' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'submissions' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'debts' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'thief_steals' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'challenges' }, scheduleReload)
      .subscribe();

    // Fallback caso o Realtime caia
    const interval = setInterval(() => loadAll(uid, false), 300000);

    return () => {
      window.clearTimeout(reloadTimer);
      window.clearTimeout(matchFlushTimer);
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
    // loadAll é recriada a cada render; incluí-la aqui re-assinaria o Realtime
    // a todo momento. O efeito deve rodar só quando o usuário logado muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.uid]);

  // Polling rápido do AO VIVO apenas enquanto há jogo rolando. Usa o endpoint
  // só-ESPN (/sync-live), que não chama o football-data, então pode ir a cada
  // 10s sem estourar limites. O Realtime entrega a mudança ao front na hora.
  const hasLive = useMemo(() => matches.some((m) => m.isLive), [matches]);
  useEffect(() => {
    if (!hasLive) return;

    const intervalId = setInterval(async () => {
      try {
        await fetch('/.netlify/functions/sync-live');
      } catch (err) {
        console.warn('Erro no sync de jogos ao vivo:', err);
      }
    }, 10000); // 10 segundos

    return () => clearInterval(intervalId);
  }, [hasLive]);

  // 5. Mapear apostas cruas (uuid) para o formato do app (username)
  const usernameByUid = useMemo(() => {
    const map: { [uid: string]: string } = {};
    participants.forEach((p) => {
      if (p.uid) map[p.uid] = p.id;
    });
    return map;
  }, [participants]);

  const bets = useMemo<Bet[]>(
    () =>
      betRows.map((r) => ({
        matchId: String(r.match_id),
        participantId: usernameByUid[r.user_id] || r.user_id,
        homeScore: r.home_score,
        awayScore: r.away_score,
        scorerId: r.scorer_id || null,
        pensPick: r.pens_pick ?? false,
        pensWinner: (r.pens_winner === 'HOME' || r.pens_winner === 'AWAY') ? r.pens_winner : null,
      })),
    [betRows, usernameByUid]
  );

  // Índice O(1) das apostas por (jogo + participante). Evita varrer a lista
  // inteira com bets.find() dentro dos loops de render e dos cálculos — com
  // dezenas de jogos × participantes, isso troca um custo O(n²) por O(n).
  const betByMatchUser = useMemo(() => {
    const map = new Map<string, Bet>();
    bets.forEach((b) => map.set(`${b.matchId}|${b.participantId}`, b));
    return map;
  }, [bets]);

  const specials = useMemo<SpecialPrediction[]>(
    () =>
      specialRows.map((r) => ({
        participantId: usernameByUid[r.user_id] || r.user_id,
        championTeam: r.champion_team,
        brazilStage: r.brazil_stage,
      })),
    [specialRows, usernameByUid]
  );

  // 6. Datas disponíveis (chave ISO + rótulo DD/MM)
  const dates = useMemo(() => {
    const seen = new Map<string, string>();
    matches.forEach((m) => {
      if (!seen.has(m.isoDate)) seen.set(m.isoDate, m.date);
    });
    return Array.from(seen, ([iso, label]) => ({ iso, label })).sort((a, b) =>
      a.iso.localeCompare(b.iso)
    );
  }, [matches]);

  // Data efetivamente selecionada: a escolhida pelo usuário ou, por padrão,
  // hoje (se tiver jogos) > próxima data com jogos > última data
  const selectedDate = useMemo(() => {
    if (selectedDateState) return selectedDateState;
    if (dates.length === 0) return '';
    const todayIso = getTodayIso();
    const found =
      dates.find((d) => d.iso === todayIso) ||
      dates.find((d) => d.iso > todayIso) ||
      dates[dates.length - 1];
    return found.iso;
  }, [selectedDateState, dates]);

  // Índice da data selecionada no array de datas (para o carrossel)
  const selectedDateIndex = useMemo(() => {
    const idx = dates.findIndex((d) => d.iso === selectedDate);
    return idx >= 0 ? idx : 0;
  }, [dates, selectedDate]);

  // Navegar para data anterior/próxima no carrossel
  const goToPrevDate = useCallback(() => {
    if (selectedDateIndex > 0) setSelectedDateState(dates[selectedDateIndex - 1].iso);
  }, [selectedDateIndex, dates]);

  const goToNextDate = useCallback(() => {
    if (selectedDateIndex < dates.length - 1) setSelectedDateState(dates[selectedDateIndex + 1].iso);
  }, [selectedDateIndex, dates]);

  // Touch handlers para swipe no carrossel de datas com efeito físico de mola
  const handleDateTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchDelta.current = 0;
    setDragOffset(0);
  }, []);

  const handleDateTouchMove = useCallback((e: React.TouchEvent) => {
    const delta = e.touches[0].clientX - touchStartX.current;
    touchDelta.current = delta;
    // Efeito de mola limitando o arrasto máximo em 120px
    const dampenedDelta = Math.sign(delta) * Math.min(Math.abs(delta), 120);
    setDragOffset(dampenedDelta);
  }, []);

  const handleDateTouchEnd = useCallback(() => {
    const delta = touchDelta.current;
    if (Math.abs(delta) > 40) {
      if (delta > 0) goToPrevDate();
      else goToNextDate();
    }
    setDragOffset(0);
    touchDelta.current = 0;
  }, [goToPrevDate, goToNextDate]);

  // 7. Palpites a exibir: o que o usuário está digitando tem prioridade;
  //    senão, a aposta já salva no banco
  const displayDrafts = useMemo(() => {
    const map: { [matchId: string]: { homeScore: string, awayScore: string } } = {};
    matches.forEach((match) => {
      const own = currentUser
        ? betByMatchUser.get(`${match.id}|${currentUser.id}`)
        : undefined;
      // campo a campo: o rascunho pode existir com só um dos lados digitado
      map[match.id] = {
        homeScore: draftBets[match.id]?.homeScore ?? (own ? String(own.homeScore) : ''),
        awayScore: draftBets[match.id]?.awayScore ?? (own ? String(own.awayScore) : ''),
      };
    });
    return map;
  }, [matches, betByMatchUser, draftBets, currentUser]);

  const displayScorers = useMemo(() => {
    const map: { [matchId: string]: string | null } = {};
    matches.forEach((match) => {
      const own = currentUser
        ? betByMatchUser.get(`${match.id}|${currentUser.id}`)
        : undefined;
      map[match.id] = scorerDrafts[match.id] !== undefined
        ? scorerDrafts[match.id]
        : (own?.scorerId || null);
    });
    return map;
  }, [matches, betByMatchUser, scorerDrafts, currentUser]);

  // Palpite de pênaltis a exibir: rascunho tem prioridade; senão o que está salvo.
  const displayPens = useMemo(() => {
    const map: { [matchId: string]: { pick: boolean; winner: 'HOME' | 'AWAY' | null } } = {};
    matches.forEach((match) => {
      const own = currentUser
        ? betByMatchUser.get(`${match.id}|${currentUser.id}`)
        : undefined;
      map[match.id] = pensDrafts[match.id] !== undefined
        ? pensDrafts[match.id]
        : { pick: own?.pensPick ?? false, winner: own?.pensWinner ?? null };
    });
    return map;
  }, [matches, betByMatchUser, pensDrafts, currentUser]);

  // Incrementar / decrementar placar via stepper (▲/▼)
  const stepScore = useCallback((matchId: string, side: 'homeScore' | 'awayScore', direction: 1 | -1) => {
    setDraftBets((prev) => {
      const current = prev[matchId]?.[side] ?? displayDrafts[matchId]?.[side] ?? '';
      const currentNum = current === '' ? 0 : parseInt(current, 10);
      const next = Math.max(0, currentNum + direction);

      // We need to keep both homeScore and awayScore in draft. If only one is specified,
      // the other should fallback to displayDrafts or empty string.
      const currentHome = prev[matchId]?.homeScore ?? displayDrafts[matchId]?.homeScore ?? '';
      const currentAway = prev[matchId]?.awayScore ?? displayDrafts[matchId]?.awayScore ?? '';

      return {
        ...prev,
        [matchId]: {
          ...prev[matchId],
          homeScore: side === 'homeScore' ? String(next) : currentHome,
          awayScore: side === 'awayScore' ? String(next) : currentAway,
        },
      };
    });
  }, [displayDrafts]);

  // Agrupar partidas por data para renderização eficiente
  const groupedMatches = useMemo(() => {
    const groups: { [key: string]: Match[] } = {};
    matches.forEach((m) => {
      if (!groups[m.isoDate]) {
        groups[m.isoDate] = [];
      }
      groups[m.isoDate].push(m);
    });
    return groups;
  }, [matches]);

  // Partidas do dia selecionado
  const activeDateMatches = useMemo(() => {
    return groupedMatches[selectedDate] || [];
  }, [groupedMatches, selectedDate]);

  const oddsDatesKey = useMemo(() => {
    const dateKeys = new Set<string>();
    if (selectedDate) dateKeys.add(selectedDate.replace(/-/g, ''));

    matches.forEach((m) => {
      if (m.isLive) dateKeys.add(m.isoDate.replace(/-/g, ''));
    });

    if (dateKeys.size === 0) dateKeys.add(getTodayIso().replace(/-/g, ''));
    return Array.from(dateKeys).sort().join(',');
  }, [matches, selectedDate]);

  useEffect(() => {
    const dateKeys = oddsDatesKey.split(',').filter(Boolean);
    let cancelled = false;

    const fetchOdds = async () => {
      try {
        const maps = await Promise.all(
          dateKeys.map(async (dateKey) => {
            const res = await fetch(
              `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${dateKey}`
            );
            if (!res.ok) return {};
            const data = await res.json();
            return collectEspnOdds(data);
          })
        );

        if (!cancelled) {
          setOddsMap(Object.assign({}, ...maps));
        }
      } catch (err) {
        console.warn("Erro ao buscar odds da ESPN:", err);
      }
    };

    fetchOdds();
    const refreshMs = hasLiveForOdds ? 30000 : 300000;
    const interval = setInterval(fetchOdds, refreshMs);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [hasLiveForOdds, oddsDatesKey]);

  // Partidas jogáveis da rodada selecionada (editáveis até 1 min antes do kickoff).
  // A sessão de apostas de um dia abre à meia-noite (Brasília) daquele dia; jogos
  // de madrugada já entram na sessão do dia anterior (ver bettingDayIso).
  const playableMatches = useMemo(() => {
    if (nowTs < startOfBrDay(selectedDate)) return [];
    return activeDateMatches.filter((m) => m.status === 'scheduled' && isBettable(m.kickoff, nowTs));
  }, [activeDateMatches, selectedDate, nowTs]);

  // Habilita o lançamento sempre que houver jogos jogáveis na rodada.
  // Caso o usuário palpite empate em um jogo do mata-mata, exigimos que ele selecione
  // quem se classifica antes de permitir o lançamento.
  const areAllPredictionsFilled = useMemo(() => {
    if (playableMatches.length === 0) return false;

    return playableMatches.every((m) => {
      if (!isKnockoutMatch(m)) return true;

      const draft = displayDrafts[m.id];
      if (!draft) return true;

      const homeVal = parseInt(draft.homeScore || '0', 10);
      const awayVal = parseInt(draft.awayScore || '0', 10);
      const isPredictedDraw = homeVal === awayVal;

      if (isPredictedDraw) {
        const pens = displayPens[m.id];
        return !!(pens && (pens.winner === 'HOME' || pens.winner === 'AWAY'));
      }

      return true;
    });
  }, [playableMatches, displayDrafts, displayPens]);

  // Verifica se a aposta já foi lançada para o dia selecionado
  const isSubmittedForSelectedDate = useMemo(() => {
    if (!currentUser || !selectedDate) return false;
    return submittedDates.has(selectedDate);
  }, [currentUser, selectedDate, submittedDates]);

  // Há alguma edição ainda não lançada? (palpite digitado difere do salvo)
  const hasChangesToLaunch = useMemo(() => {
    if (!currentUser) return false;
    return playableMatches.some((m) => {
      const own = betByMatchUser.get(`${m.id}|${currentUser.id}`);
      const draft = displayDrafts[m.id];
      if (!draft) return false;
      // Trocar só o artilheiro (jogos do Brasil) já habilita relançar
      if (isBrazilMatch(m) && (displayScorers[m.id] || null) !== (own?.scorerId || null)) {
        return true;
      }
      // Trocar o palpite de pênaltis (mata-mata) também habilita relançar
      if (isKnockoutMatch(m)) {
        const dp = displayPens[m.id] ?? { pick: false, winner: null };
        if (dp.pick !== (own?.pensPick ?? false) || (dp.winner ?? null) !== (own?.pensWinner ?? null)) {
          return true;
        }
      }
      if (!own) return draft.homeScore.trim() !== '' || draft.awayScore.trim() !== '';
      return draft.homeScore !== String(own.homeScore) || draft.awayScore !== String(own.awayScore);
    });
  }, [playableMatches, betByMatchUser, displayDrafts, displayScorers, displayPens, currentUser]);

  // Ao cruzar um kickoff, recarrega os dados para atualizar o estado do jogo.
  useEffect(() => {
    const uid = currentUser?.uid;
    if (!uid) return;
    const justStarted = matches.some((m) => {
      const k = Date.parse(m.kickoff);
      return k <= nowTs && k > nowTs - 35000;
    });
    if (!justStarted) return;
    const t = window.setTimeout(() => loadAll(uid, false), 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nowTs]);

  // Handler de Login (Supabase Auth: nome -> nome@bolao.app)
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const username = usernameInput.trim().toLowerCase();
    if (!username) {
      showToast('Por favor, digite seu nome!');
      return;
    }
    if (!passwordInput) {
      showToast('Por favor, digite sua senha!');
      return;
    }

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: `${username}@bolao.app`,
      password: passwordInput,
    });

    if (authError || !data.user) {
      showToast('Nome ou senha incorretos!');
      return;
    }

    const { data: prof } = await supabase
      .from('participants')
      .select('id, username, name, avatar_url')
      .eq('id', data.user.id)
      .single();

    if (!prof) {
      showToast('Participante não encontrado. Avise o administrador do bolão!');
      return;
    }

    const participant: Participant = {
      id: prof.username,
      uid: prof.id,
      name: prof.name,
      avatarUrl: prof.avatar_url,
    };

    localStorage.setItem('bolao_current_user', JSON.stringify(participant));
    setCurrentUser(participant);

    // Iniciar fluxo da intro splash
    setSplashVideo('intro');
    setCurrentScreen('splash');
    setTimeout(() => {
      setCurrentScreen('app');
    }, 4500); // 4.5 segundos de intro.mp4 como fallback de tempo
  };

  // Handler de Logout
  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('bolao_current_user');
    setCurrentUser(null);
    setCurrentScreen('login');
    setUsernameInput('');
    setPasswordInput('');
    setActiveTab('jogos');
    setBetRows([]);
    setSubmittedDates(new Set());
    setDraftBets({});
    setLoading(true); // o próximo login recarrega tudo
  };

  // Handler de Lançamento de Apostas (validação final é feita no servidor)
  const handleLaunchBets = async () => {
    if (!areAllPredictionsFilled || !currentUser?.uid) {
      showToast('Por favor, preencha todos os palpites do dia antes de lançar!');
      return;
    }

    const payload = playableMatches.map((m) => {
      const draft = displayDrafts[m.id] ?? { homeScore: '0', awayScore: '0' };
      const scorerId = isBrazilMatch(m) ? displayScorers[m.id] || null : null;

      const homeVal = parseInt(draft.homeScore || '0', 10);
      const awayVal = parseInt(draft.awayScore || '0', 10);
      const isPredictedDraw = homeVal === awayVal;

      // Pênaltis/Classificação: só no mata-mata e se o palpite de placar for empate.
      const pens = (isKnockoutMatch(m) && isPredictedDraw)
        ? (displayPens[m.id] ?? { pick: false, winner: null })
        : { pick: false, winner: null };

      return {
        match_id: Number(m.id),
        home_score: homeVal,
        away_score: awayVal,
        scorer_id: scorerId,
        pens_pick: pens.pick,
        pens_winner: pens.winner, // Salva o vencedor independente de pens_pick
      };
    });

    const { error: rpcError } = await supabase.rpc('submit_bets', {
      p_bets: payload,
      p_bet_date: selectedDate,
    });

    if (rpcError) {
      console.error('Erro ao lançar apostas:', rpcError);
      // Mensagem amigável; o detalhe técnico fica só no console (não expõe o banco).
      showToast('Não foi possível lançar as apostas. Confira se os jogos ainda não começaram e tente de novo.');
      return;
    }

    setSubmittedDates((prev) => new Set(prev).add(selectedDate));
    setDraftBets({}); // as apostas salvas passam a alimentar os campos
    setScorerDrafts({}); // limpar rascunho de artilheiro
    setPensDrafts({}); // limpar rascunho de pênaltis
    await loadAll(currentUser.uid, false);
    setShowPixModal(true); // lembra do PIX que valida a aposta do dia
  };

  // Handler de salvar os palpites especiais (campeão + até onde o Brasil vai)
  const handleSaveSpecial = async (championTeam: string, brazilStage: BrazilStage) => {
    if (!currentUser?.uid) return;
    const { error: spError } = await supabase.from('special_predictions').upsert({
      user_id: currentUser.uid,
      champion_team: championTeam,
      brazil_stage: brazilStage,
      updated_at: new Date().toISOString(),
    });
    if (spError) {
      console.error('Erro ao salvar palpites especiais:', spError);
      showToast('Não foi possível salvar os palpites. Tente de novo.');
      return;
    }
    await loadAll(currentUser.uid, false);
    showToast('Palpites da Copa salvos!', 'success');
  };

  // Handler para pendurar aposta (R$ 2,50).
  // Defesa em profundidade: só deixa pendurar no PRÓPRIO nome (além da UI e do
  // RLS `debts_insert_own`, garante aqui que ninguém pendura por outra pessoa).
  const handleRegisterDebt = async (userId: string, date: string) => {
    if (!currentUser?.uid || userId !== currentUser.uid) {
      showToast('Você só pode pendurar a sua própria aposta!');
      return;
    }
    // Evita duplicado para o mesmo dia e usuário
    if (debts.some((d) => d.userId === userId && d.debtDate === date)) {
      showToast('Você já pendurou a aposta de hoje!');
      return;
    }

    const { error: dbError } = await supabase.from('debts').insert({
      user_id: userId,
      debt_date: date,
      amount: 2.50,
    });

    if (dbError) {
      console.error('Erro ao pendurar aposta:', dbError);
      showToast('Não foi possível pendurar a aposta. Tente de novo.');
      return;
    }

    showToast('Aposta pendurada com sucesso!', 'success');
    await loadAll(currentUser.uid, false);
  };

  // Handler para pagar/dar baixa em UM fiado.
  // O filtro extra por `user_id` garante que só dá baixa em fiado PRÓPRIO,
  // mesmo que o id de outro participante chegasse por engano (o RLS também barra).
  const handleRemoveDebt = async (debtId: number) => {
    if (!currentUser?.uid) return;
    const { error: dbError } = await supabase
      .from('debts')
      .delete()
      .eq('id', debtId)
      .eq('user_id', currentUser.uid);

    if (dbError) {
      console.error('Erro ao dar baixa no fiado:', dbError);
      showToast('Não foi possível dar baixa no fiado. Tente de novo.');
      return;
    }

    showToast('Baixa no fiado realizada com sucesso!', 'success');
    await loadAll(currentUser.uid, false);
  };

  // Handler para realizar o roubo de ponto (Ladrão)
  const handleExecuteSteal = async (roundDate: string, victimId: string) => {
    if (!currentUser?.uid) return;
    const victim = participants.find((p) => p.id === victimId);
    if (!victim?.uid) {
      showToast('Participante inválido.', 'error');
      return;
    }

    try {
      const { error: dbError } = await supabase.from('thief_steals').insert({
        thief_id: currentUser.uid,
        victim_id: victim.uid,
        round_date: roundDate,
      });

      if (dbError) throw dbError;

      showToast(`Você roubou 1 ponto de ${victim.name}! 🥷`, 'success');
      await loadAll(currentUser.uid, false);
    } catch (err: any) {
      console.error('Erro ao roubar ponto:', err);
      showToast(err.message || 'Não foi possível realizar o roubo.', 'error');
    }
  };

  // Salva o desafio no estado temporário para que o usuário confirme antes de enviar.
  const handleChallenge = (challengedUserId: string, match: Match) => {
    setPendingConfirmChallenge({ challengedId: challengedUserId, match });
  };

  // Envia o desafio de fato contra outro participante (mata-mata).
  const executeChallengeCreation = async (challengedUserId: string, match: Match) => {
    if (!currentUser?.uid) return;
    const challenged = participants.find((p) => p.id === challengedUserId);
    if (!challenged?.uid) {
      showToast('Participante inválido.', 'error');
      return;
    }
    try {
      const res = await fetch('/.netlify/functions/create-challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId: Number(match.id),
          challengerUid: currentUser.uid,
          challengedUid: challenged.uid,
        }),
      });
      const data = await res.json().catch(() => ({} as { error?: string }));
      if (!res.ok) {
        showToast(data?.error || 'Não foi possível criar o desafio.', 'error');
        return;
      }
      showToast(`Desafio lançado contra ${challenged.name}! ⚔️`, 'success');
      await loadAll(currentUser.uid, false);
    } catch (err) {
      console.error('Erro ao criar desafio:', err);
      showToast('Falha de rede ao criar o desafio.', 'error');
    }
  };

  // Aceita ou recusa um desafio recebido (só o desafiado).
  const handleRespondChallenge = async (challengeId: string, accept: boolean) => {
    if (!currentUser?.uid) return;
    try {
      const res = await fetch('/.netlify/functions/respond-challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId, uid: currentUser.uid, accept }),
      });
      const data = await res.json().catch(() => ({} as { error?: string }));
      if (!res.ok) {
        showToast(data?.error || 'Não foi possível responder ao desafio.', 'error');
        return;
      }
      showToast(accept ? 'Desafio aceito! ⚔️' : 'Desafio recusado.', 'success');
      await loadAll(currentUser.uid, false);
    } catch (err) {
      console.error('Erro ao responder desafio:', err);
      showToast('Falha de rede ao responder o desafio.', 'error');
    }
  };

  // Handler para dispensar notificação de roubo sofrido
  const dismissSteal = (stealId: string) => {
    const next = [...dismissedSteals, stealId];
    setDismissedSteals(next);
    localStorage.setItem('dismissed_steals', JSON.stringify(next));
  };



  // Handler para quitar TODOS os fiados de uma vez — sempre os do PRÓPRIO usuário.
  // Ignora o userId recebido e usa o uid logado: ninguém quita o fiado de outro.
  const handleRemoveAllDebts = async (userId: string) => {
    if (!currentUser?.uid || userId !== currentUser.uid) {
      showToast('Você só pode quitar os seus próprios fiados!');
      return;
    }
    const { error: dbError } = await supabase
      .from('debts')
      .delete()
      .eq('user_id', currentUser.uid);

    if (dbError) {
      console.error('Erro ao quitar fiados:', dbError);
      showToast('Não foi possível quitar os fiados. Tente de novo.');
      return;
    }

    showToast('Todos os fiados foram quitados!', 'success');
    await loadAll(currentUser.uid, false);
  };

  // Calcular ranking/classificação dos participantes (inclui os +5 dos especiais)
  const standings = useMemo<ParticipantStanding[]>(() => {
    return calculateStandings(participants, matches, bets, specials, thiefSteals, challenges);
  }, [participants, matches, bets, specials, thiefSteals, challenges]);

  // Evolução no ranking: compara a posição atual com a posição ANTES da última
  // rodada finalizada. Valor positivo = subiu; negativo = caiu; 0 = manteve.
  const rankChanges = useMemo<Record<string, number>>(() => {
    const finishedMatches = matches
      .filter((m) => m.status === 'finished' && m.homeScore !== null && m.awayScore !== null)
      .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());

    if (finishedMatches.length === 0) return {};

    // Remove apenas o ÚLTIMO jogo finalizado para saber como estava o ranking exatamente antes dele
    const lastMatch = finishedMatches[finishedMatches.length - 1];
    const prevMatches = matches.filter((m) => m.id !== lastMatch.id);
    const prev = calculateStandings(participants, prevMatches, bets, specials, thiefSteals, challenges);

    const prevRank: Record<string, number> = {};
    prev.forEach((s, i) => {
      prevRank[s.participantId] = i;
    });

    const changes: Record<string, number> = {};
    standings.forEach((s, i) => {
      const pr = prevRank[s.participantId];
      changes[s.participantId] = pr == null ? 0 : pr - i;
    });
    return changes;
  }, [participants, matches, bets, specials, standings]);

  // Prêmio acumulado: R$ 10 por dia desde 12/06 até o fim da Copa (19/07)
  const accumulatedPot = useMemo(() => calcAccumulatedPot(getTodayIso()), [nowTs]); // eslint-disable-line react-hooks/exhaustive-deps

  // ----------------------------------------------------
  // RENDERIZAÇÃO DA TELA DE LOGIN
  // ----------------------------------------------------
  if (currentScreen === 'login') {
    return (
      <div className="login-screen-container">
        <div className="login-banner-container">
          <img loading="lazy" decoding="async" src="/imagens/login.webp" alt="Bandidos Apostados" className="login-banner-img" />
        </div>

        <form onSubmit={handleLoginSubmit} className="login-form-container">
          <div className="login-form-group">
            <label className="login-field-label" htmlFor="login-username">Nome</label>
            <input
              id="login-username"
              type="text"
              autoComplete="username"
              className="login-field-input"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              placeholder="Digite seu nome"
            />
          </div>

          <div className="login-form-group">
            <label className="login-field-label" htmlFor="login-password">Senha</label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              className="login-field-input"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Digite sua senha"
            />
          </div>

          <button type="submit" className="launch-bet-btn-p16 active" style={{ marginTop: '1.25rem' }}>
            <span className="launch-bet-btn-inner">
              <span>ENTRAR</span>
              <LogIn size={18} className="launch-btn-icon" />
            </span>
          </button>
        </form>

        {toastEl}
      </div>
    );
  }

  // ----------------------------------------------------
  // RENDERIZAÇÃO DA TELA DE SPLASH (INTRO.MP4)
  // ----------------------------------------------------
  if (currentScreen === 'splash') {
    return (
      <div className="splash-screen" onClick={() => setCurrentScreen(currentUser ? 'app' : 'login')}>
        <video
          // ref callback: garante a PROPRIEDADE muted no instante em que o
          // elemento monta — ANTES de qualquer tentativa de play (o iOS exige
          // isso e o React nem sempre seta a propriedade só pelo atributo).
          ref={(el) => {
            splashVideoRef.current = el;
            if (el) { el.muted = true; el.defaultMuted = true; }
          }}
          src={splashVideo === 'intro' ? '/imagens/intro.mp4' : '/imagens/reload.mp4'}
          muted
          playsInline
          // Sem `autoPlay`: o atributo dispara cedo demais (antes do muted valer)
          // e o iOS bloqueia mostrando o botão de play. Disparamos o play() nós
          // mesmos quando o vídeo está pronto, já com muted garantido.
          onLoadedData={(e) => { e.currentTarget.play().catch(() => { }); }}
          className="splash-gif"
          onEnded={() => setCurrentScreen(currentUser ? 'app' : 'login')}
        />
      </div>
    );
  }

  // ----------------------------------------------------
  // RENDERIZAÇÃO DO APP PRINCIPAL
  // ----------------------------------------------------
  return (
    <div className="app-container">

      {/* ============================================
          MODAL OVERLAY DE CONFIRMAÇÃO DE DESAFIO (bloqueia o app)
          ============================================ */}
      {pendingConfirmChallenge && (() => {
        const match = pendingConfirmChallenge.match;
        const challenger = currentUser;
        const challenged = participants.find((p) => p.id === pendingConfirmChallenge.challengedId);
        if (!challenged || !challenger) return null;

        const challengerBet = betByMatchUser.get(`${match.id}|${challenger.id}`);
        const challengedBet = betByMatchUser.get(`${match.id}|${challenged.id}`);

        const challengerPick = predictedAdvancer(challengerBet, match);
        const challengedPick = predictedAdvancer(challengedBet, match);
        if (!challengerPick || !challengedPick) return null;

        const challengerTeam = challengerPick === 'HOME' ? match.homeTeam : match.awayTeam;
        const challengedTeam = challengedPick === 'HOME' ? match.homeTeam : match.awayTeam;

        const challengerFlag = challengerPick === 'HOME' ? match.homeFlag : match.awayFlag;
        const challengedFlag = challengedPick === 'HOME' ? match.awayFlag : match.awayFlag;

        const challengerTeamEn = challengerPick === 'HOME' ? match.homeTeamEn : match.awayTeamEn;
        const challengedTeamEn = challengedPick === 'HOME' ? match.homeTeamEn : match.awayTeamEn;

        const challengerColors = getTeamColors(challengerTeamEn);
        const challengedColors = getTeamColors(challengedTeamEn);

        const challengerAvatar = `/imagens/ranking ${challenger.id}.webp`;
        const challengedAvatar = `/imagens/ranking ${challenged.id}.webp`;

        return (
          <div className="challenge-overlay">
            <div className="challenge-modal">
              {/* Glow de fundo */}
              <div className="challenge-modal-glow"></div>

              {/* Conteúdo */}
              <div className="challenge-modal-content">
                {/* Título */}
                <div className="challenge-modal-title">CONFIRMAR DESAFIO?</div>

                {/* VS Section: Fotos dos dois participantes */}
                <div className="challenge-vs-section">
                  <div className="challenge-vs-player">
                    {/* Aurora glow do desafiante */}
                    <div
                      className="challenge-vs-aurora"
                      style={{
                        '--aurora-c1': challengerColors[0],
                        '--aurora-c2': challengerColors[1] || challengerColors[0],
                        '--aurora-c3': challengerColors[2] || 'transparent'
                      } as React.CSSProperties}
                    ></div>
                    {/* Faíscas */}
                    <div className="challenge-sparks">
                      <span className="spark s1"></span>
                      <span className="spark s2"></span>
                      <span className="spark s3"></span>
                      <span className="spark s4"></span>
                      <span className="spark s5"></span>
                      <span className="spark s6"></span>
                    </div>
                    <div className="challenge-vs-avatar-ring challenger-ring">
                      <img
                        src={challengerAvatar}
                        alt={challenger.name}
                        className="challenge-vs-avatar"
                        onError={(e) => { e.currentTarget.src = challenger.avatarUrl || '/imagens/default-avatar.png'; }}
                      />
                    </div>
                    <span className="challenge-vs-name">{challenger.name} (Você)</span>
                  </div>

                  <div className="challenge-vs-badge">VS</div>

                  <div className="challenge-vs-player">
                    {/* Aurora glow do desafiado */}
                    <div
                      className="challenge-vs-aurora"
                      style={{
                        '--aurora-c1': challengedColors[0],
                        '--aurora-c2': challengedColors[1] || challengedColors[0],
                        '--aurora-c3': challengedColors[2] || 'transparent'
                      } as React.CSSProperties}
                    ></div>
                    {/* Faíscas */}
                    <div className="challenge-sparks">
                      <span className="spark s1"></span>
                      <span className="spark s2"></span>
                      <span className="spark s3"></span>
                      <span className="spark s4"></span>
                      <span className="spark s5"></span>
                      <span className="spark s6"></span>
                    </div>
                    <div className="challenge-vs-avatar-ring challenged-ring">
                      <img
                        src={challengedAvatar}
                        alt={challenged.name}
                        className="challenge-vs-avatar"
                        onError={(e) => { e.currentTarget.src = challenged.avatarUrl || '/imagens/default-avatar.png'; }}
                      />
                    </div>
                    <span className="challenge-vs-name">{challenged.name}</span>
                  </div>
                </div>

                {/* Jogo */}
                <div className="challenge-modal-match">
                  <img src={flagSrc(match.homeFlag, 40)} alt="" className="challenge-modal-flag" />
                  <span className="challenge-modal-team-name">{match.homeTeam}</span>
                  <span className="challenge-modal-x">x</span>
                  <span className="challenge-modal-team-name">{match.awayTeam}</span>
                  <img src={flagSrc(match.awayFlag, 40)} alt="" className="challenge-modal-flag" />
                </div>

                {/* Palpites */}
                <div className="challenge-modal-picks">
                  <div className="challenge-modal-pick">
                    <span className="challenge-modal-pick-name">{challenger.name} (Você)</span>
                    <span className="challenge-modal-pick-value">
                      <img src={flagSrc(challengerFlag, 40)} alt="" className="challenge-modal-pick-flag" />
                      {challengerTeam} se classifica
                    </span>
                  </div>
                  <div className="challenge-modal-pick">
                    <span className="challenge-modal-pick-name">{challenged.name}</span>
                    <span className="challenge-modal-pick-value">
                      <img src={flagSrc(challengedFlag, 40)} alt="" className="challenge-modal-pick-flag" />
                      {challengedTeam} se classifica
                    </span>
                  </div>
                </div>

                {/* Regra */}
                <div className="challenge-modal-rule">
                  Quem cravar quem avança rouba <strong>+1 ponto</strong> do outro! 🏆
                </div>

                {/* Botões */}
                <div className="challenge-modal-actions">
                  <button
                    type="button"
                    className="challenge-modal-btn accept"
                    onClick={() => {
                      executeChallengeCreation(challenged.id, match);
                      setPendingConfirmChallenge(null);
                    }}
                  >
                    <span className="challenge-modal-btn-inner"></span>
                    <span className="challenge-btn-text">ENVIAR DESAFIO</span>
                  </button>
                  <button
                    type="button"
                    className="challenge-modal-btn decline"
                    onClick={() => setPendingConfirmChallenge(null)}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ============================================
          MODAL OVERLAY DE DESAFIO (bloqueia o app)
          ============================================ */}
      {currentUser && (() => {
        let pendingChallenges = challenges.filter((c) => {
          if (c.status !== 'pending') return false;
          if (c.challengedId !== currentUser.id) return false;
          if (dismissedChallenges.includes(c.id)) return false;
          const match = matches.find((m) => m.id === c.matchId);
          return match && match.status !== 'finished';
        });



        const firstPending = pendingChallenges[0];
        if (!firstPending) return null;

        const challenger = participants.find(p => p.id === firstPending.challengerId);
        const challenged = currentUser;
        const match = matches.find(m => m.id === firstPending.matchId);
        if (!match) return null;

        const challengerTeam = firstPending.challengerPick === 'HOME' ? match.homeTeam : match.awayTeam;
        const challengedTeam = firstPending.challengedPick === 'HOME' ? match.homeTeam : match.awayTeam;
        const challengerFlag = firstPending.challengerPick === 'HOME' ? match.homeFlag : match.awayFlag;
        const challengedFlag = firstPending.challengedPick === 'HOME' ? match.homeFlag : match.awayFlag;

        const challengerTeamEn = firstPending.challengerPick === 'HOME' ? match.homeTeamEn : match.awayTeamEn;
        const challengedTeamEn = firstPending.challengedPick === 'HOME' ? match.homeTeamEn : match.awayTeamEn;

        const challengerColors = getTeamColors(challengerTeamEn);
        const challengedColors = getTeamColors(challengedTeamEn);

        const challengerAvatar = `/imagens/ranking ${firstPending.challengerId}.webp`;
        const challengedAvatar = `/imagens/ranking ${challenged.id}.webp`;

        return (
          <div className="challenge-overlay">
            <div className="challenge-modal">
              {/* Glow de fundo */}
              <div className="challenge-modal-glow"></div>

              {/* Conteúdo */}
              <div className="challenge-modal-content">
                {/* Título */}
                <div className="challenge-modal-title">VOCÊ FOI DESAFIADO!</div>

                {/* VS Section: Fotos dos dois participantes */}
                <div className="challenge-vs-section">
                  <div className="challenge-vs-player">
                    {/* Aurora glow do time escolhido pelo desafiante */}
                    <div
                      className="challenge-vs-aurora"
                      style={{
                        '--aurora-c1': challengerColors[0],
                        '--aurora-c2': challengerColors[1] || challengerColors[0],
                        '--aurora-c3': challengerColors[2] || 'transparent'
                      } as React.CSSProperties}
                    ></div>
                    {/* Faíscas */}
                    <div className="challenge-sparks">
                      <span className="spark s1"></span>
                      <span className="spark s2"></span>
                      <span className="spark s3"></span>
                      <span className="spark s4"></span>
                      <span className="spark s5"></span>
                      <span className="spark s6"></span>
                    </div>
                    <div className="challenge-vs-avatar-ring challenger-ring">
                      <img
                        src={challengerAvatar}
                        alt={challenger?.name || firstPending.challengerId}
                        className="challenge-vs-avatar"
                        onError={(e) => { e.currentTarget.src = challenger?.avatarUrl || '/imagens/default-avatar.png'; }}
                      />
                    </div>
                    <span className="challenge-vs-name">{challenger?.name || firstPending.challengerId}</span>
                  </div>

                  <div className="challenge-vs-badge">VS</div>

                  <div className="challenge-vs-player">
                    {/* Aurora glow do time escolhido pelo desafiado */}
                    <div
                      className="challenge-vs-aurora"
                      style={{
                        '--aurora-c1': challengedColors[0],
                        '--aurora-c2': challengedColors[1] || challengedColors[0],
                        '--aurora-c3': challengedColors[2] || 'transparent'
                      } as React.CSSProperties}
                    ></div>
                    {/* Faíscas */}
                    <div className="challenge-sparks">
                      <span className="spark s1"></span>
                      <span className="spark s2"></span>
                      <span className="spark s3"></span>
                      <span className="spark s4"></span>
                      <span className="spark s5"></span>
                      <span className="spark s6"></span>
                    </div>
                    <div className="challenge-vs-avatar-ring challenged-ring">
                      <img
                        src={challengedAvatar}
                        alt={challenged.name}
                        className="challenge-vs-avatar"
                        onError={(e) => { e.currentTarget.src = challenged.avatarUrl || '/imagens/default-avatar.png'; }}
                      />
                    </div>
                    <span className="challenge-vs-name">{challenged.name}</span>
                  </div>
                </div>

                {/* Jogo */}
                <div className="challenge-modal-match">
                  <img src={flagSrc(match.homeFlag, 40)} alt="" className="challenge-modal-flag" />
                  <span className="challenge-modal-team-name">{match.homeTeam}</span>
                  <span className="challenge-modal-x">x</span>
                  <span className="challenge-modal-team-name">{match.awayTeam}</span>
                  <img src={flagSrc(match.awayFlag, 40)} alt="" className="challenge-modal-flag" />
                </div>

                {/* Palpites */}
                <div className="challenge-modal-picks">
                  <div className="challenge-modal-pick">
                    <span className="challenge-modal-pick-name">{challenger?.name || firstPending.challengerId}</span>
                    <span className="challenge-modal-pick-value">
                      <img src={flagSrc(challengerFlag, 40)} alt="" className="challenge-modal-pick-flag" />
                      {challengerTeam} se classifica
                    </span>
                  </div>
                  <div className="challenge-modal-pick">
                    <span className="challenge-modal-pick-name">{challenged.name}</span>
                    <span className="challenge-modal-pick-value">
                      <img src={flagSrc(challengedFlag, 40)} alt="" className="challenge-modal-pick-flag" />
                      {challengedTeam} se classifica
                    </span>
                  </div>
                </div>

                {/* Regra */}
                <div className="challenge-modal-rule">
                  Quem cravar quem avança rouba <strong>+1 ponto</strong> do outro! 🏆
                </div>

                {/* Botões */}
                <div className="challenge-modal-actions">
                  <button
                    type="button"
                    className="challenge-modal-btn accept"
                    onClick={() => handleRespondChallenge(firstPending.id, true)}
                  >
                    <span className="challenge-modal-btn-inner"></span>
                    <span className="challenge-btn-text">ACEITAR DESAFIO</span>
                  </button>
                  <button
                    type="button"
                    className="challenge-modal-btn decline"
                    onClick={() => handleRespondChallenge(firstPending.id, false)}
                  >
                    Recusar 🐔
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* HEADER BANNER CARD (Apenas na aba de partidas) */}
      {activeTab === 'jogos' && (
        <div className="app-header-card-wrapper">
          <div className="app-header-card-gradient-border">
            <img loading="lazy" decoding="async" src="/imagens/login.webp" alt="Bandidos Apostados Banner" className="app-header-card-img" />
          </div>
        </div>
      )}

      {/* CONTEÚDO PRINCIPAL */}
      <main style={{ flexGrow: 1, paddingBottom: '2.5rem' }}>
        {/* ABA: PARTIDAS & APOSTAS */}
        {activeTab === 'jogos' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {/* NOTIFICAÇÕES DO LADRÃO (THIEF) */}
            {currentUser && (() => {
              // Calculate thief rounds
              const thiefRounds = calculateThiefRounds(matches, betRows.map(b => ({
                matchId: String(b.match_id),
                participantId: b.user_id,
                homeScore: b.home_score,
                awayScore: b.away_score,
                scorerId: b.scorer_id,
                pensPick: !!b.pens_pick,
                pensWinner: b.pens_winner as 'HOME' | 'AWAY' | null
              })), participants);

              const pendingSteals = Object.entries(thiefRounds)
                .filter(([date, status]) => status.thiefId === currentUser.id && !thiefSteals.some(s => s.roundDate === date))
                .map(([date, status]) => ({ date, status }));

              const receivedSteals = thiefSteals.filter(s => s.victimId === currentUser.id && !dismissedSteals.includes(s.id));

              const formatBrlDate = (isoDate: string) => {
                const parts = isoDate.split('-');
                if (parts.length === 3) return `${parts[2]}/${parts[1]}`;
                return isoDate;
              };

              return (
                <>
                  {/* Roubos Sofridos */}
                  {receivedSteals.map((steal) => {
                    const thief = participants.find(p => p.id === steal.thiefId);
                    return (
                      <div key={steal.id} className="thief-victim-card">
                        <div className="thief-victim-content">
                          <span className="thief-victim-icon">⚠️</span>
                          <div className="thief-victim-text">
                            <span className="thief-victim-title">PONTO ROUBADO!</span>
                            <span className="thief-victim-desc">
                              O participante <b>{thief?.name || steal.thiefId}</b> roubou 1 ponto seu referente à rodada de <b>{formatBrlDate(steal.roundDate)}</b>!
                            </span>
                          </div>
                        </div>
                        <button type="button" className="thief-victim-close" onClick={() => dismissSteal(steal.id)}>✕</button>
                      </div>
                    );
                  })}

                  {/* Roubos Pendentes (Você é o Ladrão) */}
                  {pendingSteals.map(({ date, status }) => {
                    const selectedVictim = selectedVictims[date] || '';
                    const stealOptions = participants.filter(p => p.id !== currentUser.id);

                    return (
                      <div key={date} className="thief-attacker-card">
                        <div className="thief-attacker-glow"></div>
                        <div className="thief-attacker-body">
                          <div className="thief-attacker-header">
                            <span className="thief-attacker-emoji">🥷</span>
                            <div className="thief-attacker-title-wrap">
                              <span className="thief-attacker-title">VOCÊ É O LADRÃO!</span>
                              <span className="thief-attacker-desc">
                                Você foi o maior pontuador da rodada de <b>{formatBrlDate(date)}</b> com <b>{status.pointsScored} pontos</b>! Escolha um adversário para roubar 1 ponto dele.
                              </span>
                            </div>
                          </div>

                          <div className="thief-attacker-action-row">
                            <select
                              className="thief-attacker-select"
                              value={selectedVictim}
                              onChange={(e) => setSelectedVictims(prev => ({ ...prev, [date]: e.target.value }))}
                            >
                              <option value="">Escolher adversário...</option>
                              {stealOptions.map((p) => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className="thief-attacker-btn"
                              disabled={!selectedVictim}
                              onClick={() => handleExecuteSteal(date, selectedVictim)}
                            >
                              Roubar Ponto 🎯
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </>
              );
            })()}

            {/* NOTIFICAÇÕES DE DESAFIO — MODAL OVERLAY */}
            {/* (bloco vazio — o modal é renderizado fora do fluxo, no topo do app-container) */}

            {/* DATE CAROUSEL (3 datas visíveis, swipeable) */}
            {dates.length > 0 && (() => {
              const progress = Math.min(Math.max(dragOffset / 120, -1), 1); // -1 to 1

              const trackStyle = {
                transform: `translateX(${dragOffset * 0.3}px)`,
                transition: dragOffset === 0 ? 'transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none',
              };

              const leftItemStyle = {
                transform: `scale(${0.85 + Math.max(0, progress) * 0.25}) rotateY(${-35 + Math.max(0, progress) * 35}deg) translateZ(${-100 + Math.max(0, progress) * 100}px) translateX(${progress * 10}px)`,
                opacity: 0.4 + Math.max(0, progress) * 0.6,
                transition: dragOffset === 0 ? 'transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.4s ease' : 'none',
              };

              const centerItemStyle = {
                transform: `scale(${1.1 - Math.abs(progress) * 0.25}) rotateY(${progress * 35}deg) translateZ(${-Math.abs(progress) * 100}px) translateX(${progress * 10}px)`,
                opacity: 1.0 - Math.abs(progress) * 0.6,
                transition: dragOffset === 0 ? 'transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.4s ease' : 'none',
              };

              const rightItemStyle = {
                transform: `scale(${0.85 + Math.max(0, -progress) * 0.25}) rotateY(${35 + Math.min(0, progress) * 35}deg) translateZ(${-100 + Math.max(0, -progress) * 100}px) translateX(${progress * 10}px)`,
                opacity: 0.4 + Math.max(0, -progress) * 0.6,
                transition: dragOffset === 0 ? 'transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.4s ease' : 'none',
              };

              return (
                <div
                  className="date-carousel-container"
                  onTouchStart={handleDateTouchStart}
                  onTouchMove={handleDateTouchMove}
                  onTouchEnd={handleDateTouchEnd}
                >
                  <div className="date-carousel-track" style={trackStyle}>
                    {/* Data anterior (esquerda) */}
                    {selectedDateIndex > 0 ? (() => {
                      const prev = dates[selectedDateIndex - 1];
                      const [, pm, pd] = prev.iso.split('-');
                      return (
                        <button className="date-carousel-item side" onClick={goToPrevDate} style={leftItemStyle}>
                          <span className="date-carousel-day">{parseInt(pd)}</span>
                          <span className="date-carousel-month">{MONTH_NAMES_FULL[parseInt(pm) - 1]}</span>
                        </button>
                      );
                    })() : (
                      <div className="date-carousel-item side" style={leftItemStyle} />
                    )}

                    {/* Data central (ativa) */}
                    {(() => {
                      const cur = dates[selectedDateIndex];
                      if (!cur) return null;
                      const [, cm, cd] = cur.iso.split('-');
                      const isToday = cur.iso === getTodayIso();
                      return (
                        <div className="date-carousel-item center" style={centerItemStyle}>
                          <span className="date-carousel-day">{parseInt(cd)}</span>
                          <span className="date-carousel-month">{MONTH_NAMES_FULL[parseInt(cm) - 1]}</span>
                          {isToday && <span className="date-carousel-sub">Hoje</span>}
                        </div>
                      );
                    })()}

                    {/* Data seguinte (direita) */}
                    {selectedDateIndex < dates.length - 1 ? (() => {
                      const next = dates[selectedDateIndex + 1];
                      const [, nm, nd] = next.iso.split('-');
                      return (
                        <button className="date-carousel-item side" onClick={goToNextDate} style={rightItemStyle}>
                          <span className="date-carousel-day">{parseInt(nd)}</span>
                          <span className="date-carousel-month">{MONTH_NAMES_FULL[parseInt(nm) - 1]}</span>
                        </button>
                      );
                    })() : (
                      <div className="date-carousel-item side" style={rightItemStyle} />
                    )}
                  </div>
                </div>
              );
            })()}

            {/* CARD CREME DAS PARTIDAS */}
            <div className="games-beige-card-container">
              {loading ? (
                <div className="copa-loading">
                  <div className="copa-loading-ball">⚽</div>
                  <div className="copa-loading-shadow"></div>
                  <div className="copa-loading-text">CARREGANDO JOGOS DA COPA</div>
                  <div className="copa-loading-dots">
                    <span></span><span></span><span></span>
                  </div>
                </div>
              ) : error ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#ef4444', fontWeight: 700 }}>
                  Erro ao carregar dados: {error}
                </div>
              ) : activeDateMatches.length > 0 ? (
                <div className="games-grid-layout">
                  {activeDateMatches.map((match, idx) => {
                    // Determinar se o jogo já começou ou terminou
                    const hasGameStarted = match.status === 'finished' || !isGameInFuture(match.kickoff, nowTs);

                    // No mata-mata os palpites dos outros ficam OCULTOS até o
                    // jogo começar (só o próprio usuário vê o seu). Na fase de
                    // grupos seguem públicos como sempre.
                    const isKnockout = match.stage !== 'GROUP_STAGE';
                    const hideOpponentPicks = isKnockout && !hasGameStarted;

                    const sessionOpen = nowTs >= startOfBrDay(selectedDate);
                    const canEditBet = sessionOpen && match.status === 'scheduled' && isBettable(match.kickoff, nowTs);

                    // Determinar vencedor para destaque visual
                    const isFinished = match.status === 'finished';
                    // Jogo decidido nos pênaltis (mata-mata): a ESPN preenche os dois
                    // placares de pênaltis. O placar normal continua empatado.
                    const wentToPens = isFinished && match.homePens != null && match.awayPens != null;
                    const homePensWinner = wentToPens && (match.homePens ?? 0) > (match.awayPens ?? 0);
                    const awayPensWinner = wentToPens && (match.awayPens ?? 0) > (match.homePens ?? 0);
                    const homeFinalWinner = isFinished && ((match.homeScore !== null && match.awayScore !== null && match.homeScore > match.awayScore) || homePensWinner);
                    const awayFinalWinner = isFinished && ((match.homeScore !== null && match.awayScore !== null && match.awayScore > match.homeScore) || awayPensWinner);
                    const isFinalDraw = isFinished && !wentToPens && match.homeScore !== null && match.awayScore !== null && match.homeScore === match.awayScore;

                    // Vencedor parcial em tempo real (jogo acontecendo)
                    const isLiveGame = hasGameStarted && !isFinished;
                    const homeLiveWinner = isLiveGame && match.homeScore !== null && match.awayScore !== null && match.homeScore > match.awayScore;
                    const awayLiveWinner = isLiveGame && match.homeScore !== null && match.awayScore !== null && match.awayScore > match.homeScore;

                    const homeClasses = [
                      'team-col-p16',
                      homeFinalWinner ? 'winner-highlight' : '',
                      awayFinalWinner ? 'loser-fade' : '',
                      isFinalDraw ? 'draw-highlight' : '',
                      homeLiveWinner ? 'live-winner' : '',
                      awayLiveWinner ? 'live-loser-fade' : ''
                    ].filter(Boolean).join(' ');

                    const awayClasses = [
                      'team-col-p16',
                      awayFinalWinner ? 'winner-highlight' : '',
                      homeFinalWinner ? 'loser-fade' : '',
                      isFinalDraw ? 'draw-highlight' : '',
                      awayLiveWinner ? 'live-winner' : '',
                      homeLiveWinner ? 'live-loser-fade' : ''
                    ].filter(Boolean).join(' ');

                    // Mini-títulos nos palpites (só quando o jogo terminou):
                    //  🔮 Profeta = acertou o placar exato
                    //  🥶 Pé Frio = só UMA pessoa zerou o palpite e todo o resto pontuou
                    const finishedTitles = isFinished && match.homeScore !== null && match.awayScore !== null;
                    const bettorTypes = finishedTitles
                      ? participants
                        .map((p) => betByMatchUser.get(`${match.id}|${p.id}`))
                        .filter((b): b is Bet => !!b)
                        .map((b) => ({ id: b.participantId, type: analyzeBet(b, match).type }))
                      : [];
                    const wrongBettors = bettorTypes.filter((x) => x.type === 'wrong');
                    const peFrioId = bettorTypes.length >= 2 && wrongBettors.length === 1 ? wrongBettors[0].id : null;

                    const cleanColors = (colors: string[]) =>
                      colors.filter(c => {
                        const lc = c.toLowerCase().trim();
                        return lc !== '#ffffff' && lc !== '#fff' && lc !== 'white';
                      });
                    const rawHomeColors = getTeamColors(match.homeTeamEn);
                    const rawAwayColors = getTeamColors(match.awayTeamEn);
                    const homeColors = cleanColors(rawHomeColors).length > 0 ? cleanColors(rawHomeColors) : ['#8b8075'];
                    const awayColors = cleanColors(rawAwayColors).length > 0 ? cleanColors(rawAwayColors) : ['#8b8075'];
                    const cardStyle = {
                      '--home-color-1': homeColors[0] || '#8b8075',
                      '--home-color-2': homeColors[1] || homeColors[0] || '#a8a29e',
                      '--home-color-3': homeColors[2] || homeColors[1] || homeColors[0] || '#d6d3d1',
                      '--away-color-1': awayColors[0] || '#8b8075',
                      '--away-color-2': awayColors[1] || awayColors[0] || '#a8a29e',
                      '--away-color-3': awayColors[2] || awayColors[1] || awayColors[0] || '#d6d3d1',
                    } as React.CSSProperties;

                    return (
                      <Fragment key={match.id}>
                        <div
                          className={`game-card-item-p16 ${match.isLive ? 'live-card-highlight' : ''}`}
                          style={cardStyle}
                        >

                          {/* Cabeçalho do Jogo (Grupo, Horário e Status alinhados em uma única linha) */}
                          <div className="game-card-header-p16">
                            <div className="game-card-header-top">
                              <span className="game-card-header-info">
                                {match.group} • {match.time}
                              </span>
                              {canEditBet ? (
                                <MatchCountdown kickoff={match.kickoff} />
                              ) : match.isLive ? (
                                <span className="live-badge-p16">
                                  <span className="live-dot-p16"></span>
                                  AO VIVO{formatLiveClock(match.liveClock) ? ` · ${formatLiveClock(match.liveClock)}` : ''}
                                </span>
                              ) : isFinished ? (
                                <span className="finished-badge-p16">
                                  ENCERRADO
                                </span>
                              ) : null}
                            </div>
                          </div>

                          {/* Corpo do Confronto — Layout Horizontal */}
                          <div className="game-card-body-p16">
                            {/* Time Mandante (coluna esquerda) */}
                            <div className={homeClasses}>
                              <div className="team-flag-badge-p16">
                                <img loading="lazy" decoding="async"
                                  src={flagSrc(match.homeFlag, 80)}
                                  alt={match.homeTeam}
                                  className="team-flag-img-p16"
                                  onError={(e) => {
                                    e.currentTarget.src = 'https://flagcdn.com/w40/un.png';
                                  }}
                                />
                              </div>
                              <div className="team-code-label-p16">
                                {match.homeTeam}
                              </div>
                            </div>

                            {/* Placar Central */}
                            <div className={`match-score-center ${canEditBet ? 'has-stepper' : 'has-display'}`}>
                              {canEditBet ? (
                                /* Stepper Home */
                                <div className="score-stepper">
                                  <button
                                    type="button"
                                    className="score-stepper-btn"
                                    onClick={() => stepScore(match.id, 'homeScore', 1)}
                                    aria-label={`Aumentar gols de ${match.homeTeam}`}
                                  >
                                    <ArrowUp size={26} />
                                  </button>
                                  <div className="score-stepper-value">
                                    {displayDrafts[match.id]?.homeScore || '0'}
                                  </div>
                                  <button
                                    type="button"
                                    className="score-stepper-btn"
                                    onClick={() => stepScore(match.id, 'homeScore', -1)}
                                    aria-label={`Diminuir gols de ${match.homeTeam}`}
                                  >
                                    <ArrowDown size={26} />
                                  </button>
                                </div>
                              ) : (
                                <div className="score-display-box-p16">
                                  {hasGameStarted ? (match.homeScore !== null ? match.homeScore : '-') : (displayDrafts[match.id]?.homeScore || '-')}
                                  {wentToPens && <span className="score-pens-p16">({match.homePens})</span>}
                                </div>
                              )}

                              <span className="match-score-x">✕</span>

                              {canEditBet ? (
                                /* Stepper Away */
                                <div className="score-stepper">
                                  <button
                                    type="button"
                                    className="score-stepper-btn"
                                    onClick={() => stepScore(match.id, 'awayScore', 1)}
                                    aria-label={`Aumentar gols de ${match.awayTeam}`}
                                  >
                                    <ArrowUp size={26} />
                                  </button>
                                  <div className="score-stepper-value">
                                    {displayDrafts[match.id]?.awayScore || '0'}
                                  </div>
                                  <button
                                    type="button"
                                    className="score-stepper-btn"
                                    onClick={() => stepScore(match.id, 'awayScore', -1)}
                                    aria-label={`Diminuir gols de ${match.awayTeam}`}
                                  >
                                    <ArrowDown size={26} />
                                  </button>
                                </div>
                              ) : (
                                <div className="score-display-box-p16">
                                  {hasGameStarted ? (match.awayScore !== null ? match.awayScore : '-') : (displayDrafts[match.id]?.awayScore || '-')}
                                  {wentToPens && <span className="score-pens-p16">({match.awayPens})</span>}
                                </div>
                              )}
                            </div>

                            {/* Time Visitante (coluna direita) */}
                            <div className={awayClasses}>
                              <div className="team-flag-badge-p16">
                                <img loading="lazy" decoding="async"
                                  src={flagSrc(match.awayFlag, 80)}
                                  alt={match.awayTeam}
                                  className="team-flag-img-p16"
                                  onError={(e) => {
                                    e.currentTarget.src = 'https://flagcdn.com/w40/un.png';
                                  }}
                                />
                              </div>
                              <div className="team-code-label-p16">
                                {match.awayTeam}
                              </div>
                            </div>
                          </div>

                          {/* Seção de palpite baseada somente nas odds retornadas pela ESPN */}
                          {match.status !== 'finished' && (() => {
                            const key = makePairKey(match.homeTeamEn, match.awayTeamEn);
                            const matchOdds = oddsMap[key];
                            if (!matchOdds) return null;

                            return (
                              <div className="oracle-inline-container-p16">
                                <div className="oracle-inline-title-p16">PALPITE DA CASA</div>
                                <div className="oracle-progress-bar">
                                  <div className="oracle-progress-segment home" style={{ width: `${matchOdds.homePct}%` }}></div>
                                  <div className="oracle-progress-segment draw" style={{ width: `${matchOdds.drawPct}%` }}></div>
                                  <div className="oracle-progress-segment away" style={{ width: `${matchOdds.awayPct}%` }}></div>
                                </div>

                                <div className="oracle-prob-simple-p16">
                                  <span>{match.homeTeam} <strong>{matchOdds.homePct}%</strong></span>
                                  <span className="oracle-prob-sep-p16">·</span>
                                  <span>Empate <strong>{matchOdds.drawPct}%</strong></span>
                                  <span className="oracle-prob-sep-p16">·</span>
                                  <span>{match.awayTeam} <strong>{matchOdds.awayPct}%</strong></span>
                                </div>
                              </div>
                            );
                          })()}

                          {/* PALPITE DE ARTILHEIRO — só em jogos do Brasil */}
                          {isBrazilMatch(match) && (() => {
                            const selectedScorer = displayScorers[match.id] || null;
                            const pickedPlayer = selectedScorer
                              ? BRAZIL_PLAYERS.find((pl) => pl.id === selectedScorer) ?? null
                              : null;
                            const isExpanded = !!expandedScorers[match.id];
                            // Com o jogo em andamento/encerrado, a borda do jogador
                            // escolhido fica verde (marcou) ou vermelha (não marcou).
                            const scorerResolved = (isFinished || isLiveGame) && !!selectedScorer;
                            const selectedScored = scorerResolved
                              ? goalsByPlayer(match.goals, selectedScorer) > 0
                              : false;

                            return (
                              <div className="scorer-picker-container">
                                <div
                                  className="scorer-picker-header clickable"
                                  onClick={() => toggleScorerExpanded(match.id)}
                                >
                                  <div className="scorer-picker-title-left">
                                    <span className="scorer-picker-emoji">⚽</span>
                                    <span>PARA MARCAR</span>
                                    {pickedPlayer && !isExpanded && (
                                      <span className="scorer-picker-header-selection">
                                        • {pickedPlayer.name}
                                      </span>
                                    )}
                                  </div>
                                  {isExpanded ? (
                                    <ChevronUp size={13} className="scorer-chevron" />
                                  ) : (
                                    <ChevronDown size={13} className="scorer-chevron" />
                                  )}
                                </div>

                                <div className={`scorer-picker-content-wrapper ${isExpanded ? 'expanded' : ''}`}>
                                  <div className="scorer-picker-content-inner">
                                    <div className="scorer-picker-subtitle">
                                      Acerte o artilheiro e ganhe <b>+1 ponto por gol dele</b>
                                    </div>
                                    <div className="scorer-picker-grid">
                                      {BRAZIL_PLAYERS.map((player) => {
                                        const isSelected = selectedScorer === player.id;
                                        const isLocked = !canEditBet;
                                        const isHidden = isLocked && !isSelected;
                                        if (isHidden && selectedScorer) return null;
                                        return (
                                          <button
                                            key={player.id}
                                            type="button"
                                            className={`scorer-player-btn ${isSelected ? 'selected' : ''} ${isLocked ? 'locked' : ''}`}
                                            onClick={() => {
                                              if (isLocked) return;
                                              setScorerDrafts((prev) => ({
                                                ...prev,
                                                [match.id]: selectedScorer === player.id ? '' : player.id,
                                              }));
                                            }}
                                            disabled={isLocked}
                                          >
                                            <div className={`scorer-player-img-wrapper ${isSelected ? 'selected' : ''} ${isSelected && scorerResolved ? (selectedScored ? 'scored' : 'missed') : ''}`}>
                                              <img
                                                loading="lazy"
                                                decoding="async"
                                                referrerPolicy="no-referrer"
                                                src={player.img}
                                                alt={player.name}
                                                className="scorer-player-img"
                                                onError={(e) => {
                                                  e.currentTarget.src = 'https://flagcdn.com/w40/br.png';
                                                }}
                                              />
                                            </div>
                                            <span className="scorer-player-name">{player.name}</span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                    {!canEditBet && !selectedScorer && (
                                      <div className="scorer-picker-none">Nenhum jogador selecionado</div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })()}

                          {/* PALPITE DE PÊNALTIS — só no mata-mata e se o placar for empate */}
                          {isKnockoutMatch(match) && (() => {
                            const draft = displayDrafts[match.id] ?? { homeScore: '', awayScore: '' };
                            const isPredictedDraw = draft.homeScore !== '' && draft.awayScore !== '' && parseInt(draft.homeScore, 10) === parseInt(draft.awayScore, 10);
                            if (!isPredictedDraw) return null;

                            const dp = displayPens[match.id] ?? { pick: false, winner: null };
                            const isExpanded = !!expandedPens[match.id];
                            // Como o jogo foi decidido. O palpite de classificação só pontua/
                            // desconta quando o jogo passou dos 90' (prorrogação ou pênaltis);
                            // decidido no tempo normal fica neutro. Fallback p/ dado antigo:
                            // pênaltis preenchido => foi a pênaltis.
                            const duration = match.duration
                              ?? (match.homePens != null && match.awayPens != null ? 'PENALTY_SHOOTOUT' : null);
                            const wasPens = duration === 'PENALTY_SHOOTOUT';
                            const wentBeyond90 = isFinished && (wasPens || duration === 'EXTRA_TIME');
                            const realWinner: 'HOME' | 'AWAY' | null =
                              match.winner === 'HOME_TEAM' ? 'HOME' : match.winner === 'AWAY_TEAM' ? 'AWAY' : null;
                            const setPens = (next: { pick: boolean; winner: 'HOME' | 'AWAY' | null }) => {
                              if (!canEditBet) return;
                              setPensDrafts((prev) => ({ ...prev, [match.id]: next }));
                            };
                            const headerSummary = dp.winner
                              ? `• ${dp.winner === 'HOME' ? match.homeTeam : match.awayTeam}${dp.pick ? ' (Pênaltis)' : ''}`
                              : (dp.pick ? '• Decisão nos pênaltis' : null);

                            return (
                              <div className="scorer-picker-container">
                                <div
                                  className="scorer-picker-header clickable"
                                  onClick={() => togglePensExpanded(match.id)}
                                >
                                  <div className="scorer-picker-title-left">
                                    <span className="scorer-picker-emoji">🏆</span>
                                    <span>QUEM SE CLASSIFICA?</span>
                                    {headerSummary && !isExpanded && (
                                      <span className="scorer-picker-header-selection">{headerSummary}</span>
                                    )}
                                  </div>
                                  {isExpanded ? (
                                    <ChevronUp size={13} className="scorer-chevron" />
                                  ) : (
                                    <ChevronDown size={13} className="scorer-chevron" />
                                  )}
                                </div>

                                <div className={`scorer-picker-content-wrapper ${isExpanded ? 'expanded' : ''}`}>
                                  <div className="scorer-picker-content-inner">
                                    {/* 1. Quem se classifica */}
                                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#15110E', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                      <span>Selecione quem avança de fase:</span>
                                      <span style={{ fontSize: '0.72rem', fontWeight: 500, color: '#8b8075' }}>
                                        Só vale se houver prorrogação ou pênaltis — Acertou: <span style={{ color: '#009c3b', fontWeight: 700 }}>+1 pt</span>. Errou: <span style={{ color: '#dc2626', fontWeight: 700 }}>-1 pt</span>. Decidido no tempo normal: 0.
                                      </span>
                                    </div>
                                    
                                    <div className="pens-winner-grid" style={{ marginTop: '0.45rem', marginBottom: '0.95rem' }}>
                                      {(['HOME', 'AWAY'] as const).map((side) => {
                                        const isSel = dp.winner === side;
                                        const name = side === 'HOME' ? match.homeTeam : match.awayTeam;
                                        const flag = side === 'HOME' ? match.homeFlag : match.awayFlag;
                                        const isLocked = !canEditBet;
                                        if (isLocked && !isSel) return null;
                                        // Só pinta verde/vermelho quando a classificação contou
                                        // (prorrogação/pênaltis). Decidido no tempo normal: neutro.
                                        const state = wentBeyond90 && isSel ? (realWinner === side ? 'scored' : 'missed') : '';
                                        return (
                                          <button
                                            key={side}
                                            type="button"
                                            className={`pens-winner-btn ${isSel ? 'selected' : ''} ${isLocked ? 'locked' : ''} ${state}`}
                                            onClick={() => setPens({ pick: dp.pick, winner: isSel ? null : side })}
                                            disabled={isLocked}
                                          >
                                            <img
                                              loading="lazy"
                                              decoding="async"
                                              src={flagSrc(flag, 40)}
                                              alt={name}
                                              className="pens-winner-flag"
                                              onError={(e) => { e.currentTarget.src = 'https://flagcdn.com/w40/un.png'; }}
                                            />
                                            <span className="pens-winner-name">{name}</span>
                                          </button>
                                        );
                                      })}
                                    </div>

                                    {/* 2. Se classifica nos pênaltis? */}
                                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#15110E', display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '0.45rem' }}>
                                      <span>A classificação será nos pênaltis?</span>
                                      <span style={{ fontSize: '0.72rem', fontWeight: 500, color: '#8b8075' }}>
                                        Acertou se haverá pênaltis: <span style={{ color: '#009c3b', fontWeight: 700 }}>+1 pt</span> (extra). Errou: <span style={{ fontWeight: 700 }}>0 pts</span>.
                                      </span>
                                    </div>

                                    <div className="pens-winner-grid" style={{ marginTop: '0.45rem' }}>
                                      <button
                                        type="button"
                                        className={`pens-winner-btn ${dp.pick ? 'selected' : ''} ${!canEditBet ? 'locked' : ''} ${wentBeyond90 && dp.pick ? (wasPens ? 'scored' : 'missed') : ''}`}
                                        onClick={() => setPens({ pick: true, winner: dp.winner })}
                                        disabled={!canEditBet}
                                      >
                                        <span style={{ fontSize: '1rem' }}>🥅</span>
                                        <span>Sim, nos pênaltis</span>
                                      </button>

                                      <button
                                        type="button"
                                        className={`pens-winner-btn ${!dp.pick ? 'selected' : ''} ${!canEditBet ? 'locked' : ''} ${wentBeyond90 && !dp.pick ? (!wasPens ? 'scored' : 'missed') : ''}`}
                                        onClick={() => setPens({ pick: false, winner: dp.winner })}
                                        disabled={!canEditBet}
                                      >
                                        <span style={{ fontSize: '1.05rem' }}>⏱️</span>
                                        <span>Não, na prorrogação</span>
                                      </button>
                                    </div>

                                    {!canEditBet && !dp.pick && !dp.winner && (
                                      <div className="scorer-picker-none" style={{ marginTop: '0.5rem' }}>Não palpitou classificação</div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })()}

                          {/* Botão para expandir/comprimir palpites */}
                          <button
                            type="button"
                            className="toggle-guesses-btn-p16"
                            onClick={() => toggleMatchExpanded(match.id)}
                          >
                            <span>Palpites</span>
                            {expandedMatches[match.id] ? (
                              <ChevronUp size={14} />
                            ) : (
                              <ChevronDown size={14} />
                            )}
                          </button>

                          {/* LISTA INLINE DE PALPITES DOS PARTICIPANTES */}
                          <div className={`inline-guesses-list-wrapper-p16 ${expandedMatches[match.id] ? 'expanded' : ''}`}>
                            <div className="inline-guesses-list-inner-p16">
                              {participants.map((p) => {
                                const bet = betByMatchUser.get(`${match.id}|${p.id}`);
                                const analysis = analyzeBet(bet, match);

                                // No mata-mata, esconde o palpite dos adversários
                                // antes do jogo começar — o usuário só enxerga o seu.
                                const isOwnPick = !!currentUser && p.id === currentUser.id;
                                const pickHidden = hideOpponentPicks && !isOwnPick;

                                // Mini-títulos do jogo. Profeta: em jogo de pênaltis
                                // exige cravar placar + forma + quem passa (ver isProfeta).
                                const isProfetaPick = !!finishedTitles && isProfeta(bet, match);
                                const isPeFrio = p.id === peFrioId;

                                // Lógica do Badge de Pontos. Inclui o bônus de
                                // pênaltis/classificação (mata-mata) para o número
                                // exibido bater com o que entra no ranking — antes
                                // o card mostrava só o placar e ignorava o ±1 de
                                // quem avança / +1 de acertar a forma de decisão.
                                let pointsBadgeClass = 'wrong';
                                let pointsText = '0';
                                if (analysis.type === 'pending') {
                                  pointsBadgeClass = 'pending';
                                  pointsText = '—';
                                } else {
                                  const totalPoints = analysis.points + pensBonus(bet, match);
                                  if (totalPoints >= 3) pointsBadgeClass = 'exact';
                                  else if (totalPoints === 2) pointsBadgeClass = 'draw';
                                  else if (totalPoints >= 1) pointsBadgeClass = 'winner';
                                  else pointsBadgeClass = 'wrong';
                                  pointsText = `${totalPoints}`;
                                }

                                // Lógica da bandeira de quem o participante achou que ia vencer
                                let predictedWinnerFlag: string | null = null;
                                if (bet) {
                                  if (bet.homeScore > bet.awayScore) {
                                    predictedWinnerFlag = match.homeFlag;
                                  } else if (bet.awayScore > bet.homeScore) {
                                    predictedWinnerFlag = match.awayFlag;
                                  }
                                }

                                // Lógica do artilheiro escolhido (só jogos do Brasil)
                                const pickedPlayer = isBrazilMatch(match)
                                  ? (currentUser && p.id === currentUser.id
                                    ? (displayScorers[match.id]
                                      ? BRAZIL_PLAYERS.find((pl) => pl.id === displayScorers[match.id]) ?? null
                                      : null)
                                    : (bet?.scorerId
                                      ? BRAZIL_PLAYERS.find((pl) => pl.id === bet.scorerId) ?? null
                                      : null))
                                  : null;
                                // Não revela o artilheiro do adversário antes do jogo (mata-mata).
                                const showScorer = !!pickedPlayer && !pickHidden;

                                // Desafio dos Molhados: só no mata-mata, com o jogo já
                                // começado (palpites revelados) e não encerrado, contra
                                // outro participante que escolheu classificado DIFERENTE.
                                const myBetForCh = currentUser ? betByMatchUser.get(`${match.id}|${currentUser.id}`) : undefined;
                                const myAdv = predictedAdvancer(myBetForCh, match);
                                const theirAdv = predictedAdvancer(bet, match);
                                // Desafios entre mim e este participante neste jogo. Pode haver
                                // mais de um (ex.: recusei e ele me redesafiou) — priorizo o
                                // ATIVO (pendente/aceito); só caio no recusado se não houver ativo.
                                const pairChs = challenges.filter((c) => c.matchId === match.id
                                  && ((c.challengerId === currentUser?.id && c.challengedId === p.id)
                                    || (c.challengerId === p.id && c.challengedId === currentUser?.id)));
                                const existingCh = pairChs.find((c) => c.status === 'pending' || c.status === 'accepted')
                                  ?? pairChs[0];
                                const iAmChallenger = !!existingCh && existingCh.challengerId === currentUser?.id;
                                // 1 desafio por pessoa por jogo: quem já está num desafio
                                // ativo (pendente/aceito) nesse jogo não pode entrar em outro.
                                const isEngaged = (uid: string | undefined) => !!uid && challenges.some((c) =>
                                  c.matchId === match.id && (c.status === 'pending' || c.status === 'accepted')
                                  && (c.challengerId === uid || c.challengedId === uid));
                                 const canChallenge = !!currentUser && p.id !== currentUser.id && isKnockout
                                   && hasGameStarted && match.status !== 'finished'
                                   && !!myAdv && !!theirAdv && myAdv !== theirAdv
                                   && !isEngaged(currentUser.id) && !isEngaged(p.id);
                                // Não aceito até o fim do jogo = expirado (não vale nada).
                                const chExpired = !!existingCh && existingCh.status === 'pending' && match.status === 'finished';
                                // Resultado do desafio (só conta se foi ACEITO e o jogo terminou).
                                const chResolved = existingCh && existingCh.status === 'accepted'
                                  && match.status === 'finished' && match.winner
                                  ? (() => {
                                    const adv = match.winner === 'HOME_TEAM' ? 'HOME' : match.winner === 'AWAY_TEAM' ? 'AWAY' : null;
                                    if (!adv) return null;
                                    const winnerId = existingCh.challengerPick === adv ? existingCh.challengerId : existingCh.challengedId;
                                    return winnerId === currentUser?.id ? 'won' : (winnerId === p.id ? 'lost' : null);
                                  })()
                                  : null;

                                return (
                                  <div key={p.id} className="inline-guess-row-p16">
                                    <div className="inline-guess-user-info-p16">
                                      <div className={`inline-guess-avatar-wrapper ${showScorer ? 'has-scorer' : ''}`}>
                                        <div className="inline-guess-avatar-border-p16">
                                          <img loading="lazy" decoding="async"
                                            src={`/imagens/ranking ${p.id}.webp`}
                                            alt={p.name}
                                            className="inline-guess-avatar-img-p16"
                                            onError={(e) => {
                                              e.currentTarget.src = p.avatarUrl;
                                            }}
                                          />
                                        </div>
                                        {showScorer && pickedPlayer && (
                                          <div className="inline-guess-scorer-overlay">
                                            <img
                                              loading="lazy" decoding="async"
                                              referrerPolicy="no-referrer"
                                              src={pickedPlayer.img}
                                              alt={pickedPlayer.name}
                                            />
                                          </div>
                                        )}
                                      </div>
                                      <div className="inline-guess-name-col-p16">
                                        {isProfetaPick && (
                                          <span className="inline-guess-title-p16 profeta">🔮 Profeta</span>
                                        )}
                                        {isPeFrio && (
                                          <span className="inline-guess-title-p16 pe-frio">
                                            <img loading="lazy" decoding="async"
                                              src="https://www.thiings.co/_next/image?url=https%3A%2F%2Flftz25oez4aqbxpq.public.blob.vercel-storage.com%2Fimage-okSb6P6VxQwXTDfYgiOiheKJpixk2a.png&w=320&q=75"
                                              alt="Pé Frio"
                                              className="pe-frio-icon-img"
                                            />
                                            Pé Frio
                                          </span>
                                        )}
                                        <span className="inline-guess-username-p16">{p.name}</span>
                                      </div>
                                    </div>

                                    <div className="inline-guess-result-info-p16">
                                      {/* 1. Elementos de Desafio (Espada/Galinha/Pendente) */}
                                      {!pickHidden && (
                                        <>
                                          {canChallenge && (
                                            <button
                                              type="button"
                                              className="challenge-btn-p16 compact-icon-btn"
                                              onClick={() => handleChallenge(p.id, match)}
                                              title="Lançar desafio ⚔️"
                                            >
                                              ⚔️
                                            </button>
                                          )}

                                          {chExpired && (
                                            <span className="challenge-badge-p16 compact-icon expired" title="Desafio expirou (sem aceite)">⌛</span>
                                          )}

                                          {existingCh && existingCh.status === 'pending' && !chExpired && !iAmChallenger && (
                                            <div className="challenge-respond-p16">
                                              <button type="button" className="challenge-accept-p16" onClick={() => handleRespondChallenge(existingCh.id, true)} title="Aceitar Desafio">⚔️</button>
                                              <button type="button" className="challenge-decline-p16" onClick={() => handleRespondChallenge(existingCh.id, false)} title="Recusar Desafio">🐔</button>
                                            </div>
                                          )}
                                          {existingCh && existingCh.status === 'pending' && !chExpired && iAmChallenger && (
                                            <span className="challenge-badge-p16 compact-icon pending" title="Aguardando resposta do desafio">⏳</span>
                                          )}

                                          {existingCh && existingCh.status === 'accepted' && !chResolved && (
                                            <span className="challenge-badge-p16 compact-icon active" title="Em desafio!">⚔️</span>
                                          )}

                                          {existingCh && existingCh.status === 'declined' && (
                                            <span className="challenge-badge-p16 compact-icon declined" title={iAmChallenger ? `${p.name} recusou seu desafio` : 'Você recusou o desafio'}>🐔</span>
                                          )}

                                          {chResolved === 'won' && (
                                            <span className="challenge-badge-p16 compact-icon won" title="Você ganhou o desafio! (+1 pt)">🏆</span>
                                          )}
                                          {chResolved === 'lost' && (
                                            <span className="challenge-badge-p16 compact-icon lost" title="Você perdeu o desafio! (-1 pt)">💀</span>
                                          )}
                                        </>
                                      )}

                                      {/* 2. Palpite do placar */}
                                      {pickHidden ? (
                                        <span className="inline-guess-hidden-text-p16">🔒 Oculto</span>
                                      ) : bet ? (
                                        <div className="inline-guess-scores-container-p16" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                            <span className="inline-guess-score-text-p16">
                                              {bet.homeScore} x {bet.awayScore}
                                            </span>
                                            {predictedWinnerFlag && (
                                              <img loading="lazy" decoding="async"
                                                src={flagSrc(predictedWinnerFlag, 40)}
                                                alt="Palpite Vencedor"
                                                className="inline-guess-winner-flag-p16"
                                              />
                                            )}
                                          </div>
                                          {bet.homeScore === bet.awayScore && isKnockout && (
                                            <div style={{ fontSize: '0.72rem', color: '#15110E', fontWeight: 600, marginTop: '2px', display: 'flex', gap: '4px', alignItems: 'center' }}>
                                              <span>{bet.pensPick ? 'Pênaltis' : 'Prorrogação'}</span>
                                              {bet.pensWinner && (() => {
                                                const flag = bet.pensWinner === 'HOME' ? match.homeFlag : match.awayFlag;
                                                return (
                                                  <>
                                                    <span style={{ color: '#8b8075' }}>•</span>
                                                    <img
                                                      src={flagSrc(flag, 40)}
                                                      alt=""
                                                      style={{
                                                        width: '20px',
                                                        height: '14px',
                                                        borderRadius: '2px',
                                                        objectFit: 'cover',
                                                        border: '1px solid rgba(21, 17, 14, 0.15)'
                                                      }}
                                                    />
                                                  </>
                                                );
                                              })()}
                                            </div>
                                          )}
                                        </div>
                                      ) : (
                                        <span className="inline-guess-none-text-p16">Sem Palpite</span>
                                      )}

                                      {/* 3. Pontuação */}
                                      {!pickHidden && (
                                        <div className={`inline-guess-badge-p16 ${pointsBadgeClass}`}>
                                          {pointsText}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                        {idx < activeDateMatches.length - 1 && (
                          <div className="game-card-separator-p16" />
                        )}
                      </Fragment>
                    );
                  })}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#15110E', fontWeight: 600 }}>
                  Nenhum jogo agendado para esta data.
                </div>
              )}

              {/* ACTION BAR DE LANÇAMENTO (exibe quando a rodada está aberta e há partidas jogáveis) */}
              {playableMatches.length > 0 && (
                <div className="launch-action-bar-p16">
                  {isSubmittedForSelectedDate && !hasChangesToLaunch ? (
                    <button className="launch-bet-btn-p16 submitted" disabled>
                      <span className="launch-bet-btn-inner">
                        <span>APOSTA LANÇADA</span>
                        <Clover size={18} className="launch-btn-icon" />
                      </span>
                    </button>
                  ) : (
                    <button
                      className={`launch-bet-btn-p16 ${areAllPredictionsFilled ? 'active' : ''}`}
                      disabled={!areAllPredictionsFilled}
                      onClick={handleLaunchBets}
                    >
                      <span className="launch-bet-btn-inner">
                        <span>LANÇAR APOSTA</span>
                        <Clover size={18} className="launch-btn-icon" />
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Opção para Logout (Sign Out) rápida no fim da aba de partidas para desenvolvimento */}
            <div style={{ padding: '0 1rem', display: 'flex', justifyContent: 'center' }}>
              <button
                onClick={handleLogout}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'rgba(255,255,255,0.4)',
                  fontSize: '0.75rem',
                  textDecoration: 'underline',
                  cursor: 'pointer'
                }}
              >
                Sair da Conta ({currentUser?.name})
              </button>
            </div>
          </div>
        )}

        {/* ABA: CHAVEAMENTO (grupos + mata-mata) */}
        {activeTab === 'chaveamento' && (
          <Suspense fallback={tabFallback}>
            <BracketTab matches={matches} />
          </Suspense>
        )}

        {/* ABA: PALPITES (especiais + histórico pessoal) */}
        {activeTab === 'palpites' && currentUser && (
          <Suspense fallback={tabFallback}>
            <PalpitesTab
              matches={matches}
              bets={bets}
              participants={participants}
              specials={specials}
              currentUser={currentUser}
              nowTs={nowTs}
              onSave={handleSaveSpecial}
            />
          </Suspense>
        )}

        {/* ABA: PAGAMENTO (PIX) */}
        {activeTab === 'pix' && (
          <Suspense fallback={tabFallback}>
            <PixTab
              accumulated={accumulatedPot}
              currentUser={currentUser}
              participants={participants}
              debts={debts}
              onRegisterDebt={handleRegisterDebt}
              onRemoveDebt={handleRemoveDebt}
              onRemoveAllDebts={handleRemoveAllDebts}
            />
          </Suspense>
        )}

        {/* ABA: RANKING */}
        {activeTab === 'ranking' && (
          <div>
            <Suspense fallback={tabFallback}>
              <StandingsTable standings={standings} matches={matches} bets={bets} rankChanges={rankChanges} />
            </Suspense>

            {/* Logout em baixo do Ranking */}
            <div style={{ padding: '2rem 1rem 0 1rem', display: 'flex', justifyContent: 'center' }}>
              <button
                onClick={handleLogout}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'rgba(255,255,255,0.4)',
                  fontSize: '0.75rem',
                  textDecoration: 'underline',
                  cursor: 'pointer'
                }}
              >
                Sair da Conta ({currentUser?.name})
              </button>
            </div>
          </div>
        )}

        {/* ABA: PERFIL */}
        {activeTab === 'perfil' && currentUser && (
          <Suspense fallback={tabFallback}>
            <ProfileTab
              currentUser={currentUser}
              participants={participants}
              matches={matches}
              bets={bets}
              specials={specials}
              standings={standings}
              challenges={challenges}
            />
          </Suspense>
        )}
      </main>

      <nav className="bottom-nav">
        <button
          className={`nav-item ${activeTab === 'jogos' ? 'active' : ''}`}
          onClick={() => switchTab('jogos')}
          title="Partidas"
          aria-label="Partidas"
        >
          <Calendar size={24} />
        </button>
        <button
          className={`nav-item ${activeTab === 'chaveamento' ? 'active' : ''}`}
          onClick={() => switchTab('chaveamento')}
          title="Chaveamento"
          aria-label="Chaveamento"
        >
          <Network size={24} />
        </button>
        <button
          className={`nav-item ${activeTab === 'palpites' ? 'active' : ''}`}
          onClick={() => switchTab('palpites')}
          title="Palpites"
          aria-label="Palpites"
        >
          <ListChecks size={24} />
        </button>
        <button
          className={`nav-item ${activeTab === 'ranking' ? 'active' : ''}`}
          onClick={() => switchTab('ranking')}
          title="Ranking"
          aria-label="Ranking"
        >
          <Trophy size={24} />
        </button>
        <button
          className={`nav-item ${activeTab === 'pix' ? 'active' : ''}`}
          onClick={() => switchTab('pix')}
          title="Pagamento"
          aria-label="Pagamento"
        >
          <Wallet size={24} />
        </button>
        <button
          className={`nav-item ${activeTab === 'perfil' ? 'active' : ''}`}
          onClick={() => switchTab('perfil')}
          title="Perfil"
          aria-label="Perfil"
        >
          <User size={24} />
        </button>
      </nav>

      {/* MODAL PIX PÓS-LANÇAMENTO (validação da aposta do dia) */}
      {showPixModal && (
        <div className="pix-modal-overlay" onClick={() => setShowPixModal(false)}>
          <div className="pix-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="pix-modal-emoji">🎉</div>
            <div className="pix-card-title">APOSTA LANÇADA!</div>
            <div className="pix-modal-text">
              Para <b>validar</b> sua aposta do dia, faça o PIX de <b>R$ 2,50</b> para:
            </div>
            <div className="pix-card-recipient">{PIX_RECIPIENT} · {PIX_BANK}</div>
            <PixKeyRow />
            <button
              type="button"
              className="pix-modal-close-btn"
              onClick={() => setShowPixModal(false)}
            >
              FECHAR
            </button>
          </div>
        </div>
      )}

      {toastEl}
    </div>
  );
}

export default App;
