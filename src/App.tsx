import { useState, useEffect, useMemo, useRef } from 'react';
import { Trophy, Calendar, CheckSquare, PencilLine, Wallet, ListChecks, ChevronDown, ChevronUp } from 'lucide-react';
import type { Match, Bet, Participant, ParticipantStanding, SpecialPrediction, BrazilStage } from './types';
import { calculateStandings, analyzeBet } from './utils/rules';
import { calcAccumulatedPot } from './utils/pot';
import { StandingsTable } from './components/StandingsTable';
import { PixTab } from './components/PixTab';
import { PalpitesTab } from './components/PalpitesTab';
import { PixKeyRow, PIX_RECIPIENT, PIX_BANK } from './components/PixKeyCopy';
import { supabase } from './lib/supabase';
import { translateTeam, mapFifaCode, flagOf, groupLabel, flagSrc } from './lib/teamMaps';

// Fuso horário de exibição: todos os horários dos jogos são convertidos para Brasília
const TZ = 'America/Sao_Paulo';

const brDateFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' });
const brTimeFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
const isoDateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

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

// Linha crua da tabela `bets` do Supabase
interface BetRow {
  user_id: string;
  match_id: number;
  home_score: number;
  away_score: number;
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
  winner: 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null;
}

// Converte uma linha da tabela `matches` do Supabase para o formato do app
const mapRowToMatch = (r: MatchDbRow): Match => {
  const d = new Date(r.utc_date);
  return {
    id: String(r.id),
    homeTeam: translateTeam(r.home_team),
    awayTeam: translateTeam(r.away_team),
    homeCode: mapFifaCode(r.home_team, r.home_tla),
    awayCode: mapFifaCode(r.away_team, r.away_tla),
    homeFlag: flagOf(r.home_team, r.home_crest),
    awayFlag: flagOf(r.away_team, r.away_crest),
    date: brDateFmt.format(d),
    time: brTimeFmt.format(d),
    group: groupLabel(r.stage, r.group_name),
    homeScore: r.home_score ?? null,
    awayScore: r.away_score ?? null,
    status: r.status === 'FINISHED' ? 'finished' : 'scheduled',
    kickoff: r.utc_date,
    isoDate: isoDateFmt.format(d),
    homeTeamEn: r.home_team,
    awayTeamEn: r.away_team,
    stage: r.stage ?? 'GROUP_STAGE',
    winner: r.winner ?? null,
    isLive: ['IN_PLAY', 'PAUSED', 'LIVE', 'EXTRA_TIME', 'PENALTY_SHOOTOUT'].includes(r.status?.toUpperCase() || ''),
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

function App() {
  // 1. Estados de Autenticação e Telas
  const [currentUser, setCurrentUser] = useState<Participant | null>(() => readCachedUser());

  const [currentScreen, setCurrentScreen] = useState<'login' | 'splash' | 'app'>(() =>
    readCachedUser() ? 'app' : 'login'
  );

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

  // Modal pós-lançamento com o PIX copia-e-cola (validação da aposta)
  const [showPixModal, setShowPixModal] = useState(false);

  // Estado para os rascunhos de palpites editados inline
  const [draftBets, setDraftBets] = useState<{ [matchId: string]: { homeScore: string, awayScore: string } }>({});

  // Estado para controlar quais palpites de jogos estão expandidos
  const [expandedMatches, setExpandedMatches] = useState<Record<string, boolean>>({});

  const toggleMatchExpanded = (matchId: string) => {
    setExpandedMatches((prev) => ({
      ...prev,
      [matchId]: !prev[matchId],
    }));
  };

  // Começa true: evita o flash de "Nenhum jogo agendado" antes da primeira carga
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Estado da Navegação Principal (Abas da bottom bar)
  const [activeTab, setActiveTab] = useState<'jogos' | 'palpites' | 'ranking' | 'pix'>('jogos');

  // Data de partidas selecionada manualmente (YYYY-MM-DD, horário de Brasília)
  const [selectedDateState, setSelectedDateState] = useState<string>('');

  // Relógio interno (30s): trava os inputs no T-1min e atualiza o estado dos jogos
  // no kickoff sem o usuário precisar recarregar a página
  const [nowTs, setNowTs] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNowTs(Date.now()), 30000);
    return () => clearInterval(tick);
  }, []);

  // Toast de notificação (substitui os alert() nativos)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const toastTimerRef = useRef<number | undefined>(undefined);

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
      const [partsRes, matchesRes, betsRes, subsRes, specialsRes] = await Promise.all([
        supabase.from('participants').select('id, username, name, avatar_url').order('username'),
        supabase.from('matches').select('*').order('utc_date'),
        supabase.from('bets').select('user_id, match_id, home_score, away_score'),
        supabase.from('submissions').select('bet_date').eq('user_id', uid),
        supabase.from('special_predictions').select('user_id, champion_team, brazil_stage'),
      ]);

      const firstError = partsRes.error || matchesRes.error || betsRes.error || subsRes.error;
      if (firstError) throw new Error(firstError.message);

      setParticipants(
        (partsRes.data ?? []).map((p) => ({
          id: p.username,
          uid: p.id,
          name: p.name,
          avatarUrl: p.avatar_url,
        }))
      );
      setMatches(((matchesRes.data ?? []) as MatchDbRow[]).map(mapRowToMatch));
      setBetRows((betsRes.data ?? []) as BetRow[]);
      setSubmittedDates(new Set((subsRes.data ?? []).map((s) => s.bet_date)));
      // specials pode falhar se a migration 003 ainda não rodou — não derruba o app
      setSpecialRows((specialsRes.data ?? []) as typeof specialRows);
      setError(null);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
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

    // Atualizações ao vivo via Supabase Realtime: qualquer mudança em
    // jogos/apostas/lançamentos recarrega os dados. O debounce agrupa as
    // rajadas de eventos (a sincronização atualiza ~104 jogos de uma vez).
    let reloadTimer: number | undefined;
    const scheduleReload = () => {
      window.clearTimeout(reloadTimer);
      reloadTimer = window.setTimeout(() => loadAll(uid, false), 800);
    };

    const channel = supabase
      .channel('bolao-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bets' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'submissions' }, scheduleReload)
      .subscribe();

    // Fallback caso o Realtime caia
    const interval = setInterval(() => loadAll(uid, false), 300000);

    return () => {
      window.clearTimeout(reloadTimer);
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [currentUser?.uid]);

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
      })),
    [betRows, usernameByUid]
  );

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
    return Array.from(seen, ([iso, label]) => ({ iso, label }));
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

  // 7. Palpites a exibir: o que o usuário está digitando tem prioridade;
  //    senão, a aposta já salva no banco
  const displayDrafts = useMemo(() => {
    const map: { [matchId: string]: { homeScore: string, awayScore: string } } = {};
    matches.forEach((match) => {
      const own = currentUser
        ? bets.find((b) => b.matchId === match.id && b.participantId === currentUser.id)
        : undefined;
      // campo a campo: o rascunho pode existir com só um dos lados digitado
      map[match.id] = {
        homeScore: draftBets[match.id]?.homeScore ?? (own ? String(own.homeScore) : ''),
        awayScore: draftBets[match.id]?.awayScore ?? (own ? String(own.awayScore) : ''),
      };
    });
    return map;
  }, [matches, bets, draftBets, currentUser]);

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

  // Partidas jogáveis de hoje (editáveis até 1 minuto antes do kickoff)
  const playableMatches = useMemo(() => {
    if (selectedDate !== getTodayIso()) return [];
    return activeDateMatches.filter((m) => m.status === 'scheduled' && isBettable(m.kickoff, nowTs));
  }, [activeDateMatches, selectedDate, nowTs]);

  // Verifica se todos os palpites das partidas jogáveis de hoje foram preenchidos
  const areAllPredictionsFilled = useMemo(() => {
    if (playableMatches.length === 0) return false;
    return playableMatches.every((m) => {
      const draft = displayDrafts[m.id];
      return draft && draft.homeScore.trim() !== '' && draft.awayScore.trim() !== '';
    });
  }, [playableMatches, displayDrafts]);

  // Verifica se a aposta já foi lançada para o dia selecionado
  const isSubmittedForSelectedDate = useMemo(() => {
    if (!currentUser || !selectedDate) return false;
    return submittedDates.has(selectedDate);
  }, [currentUser, selectedDate, submittedDates]);

  // Há alguma edição ainda não lançada? (palpite digitado difere do salvo)
  const hasChangesToLaunch = useMemo(() => {
    if (!currentUser) return false;
    return playableMatches.some((m) => {
      const own = bets.find((b) => b.matchId === m.id && b.participantId === currentUser.id);
      const draft = displayDrafts[m.id];
      if (!draft) return false;
      if (!own) return draft.homeScore.trim() !== '' || draft.awayScore.trim() !== '';
      return draft.homeScore !== String(own.homeScore) || draft.awayScore !== String(own.awayScore);
    });
  }, [playableMatches, bets, displayDrafts, currentUser]);

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
    setCurrentScreen('splash');
    setTimeout(() => {
      setCurrentScreen('app');
    }, 3500); // 3.5 segundos de intro.webp
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
      const draft = displayDrafts[m.id];
      return {
        match_id: Number(m.id),
        home_score: parseInt(draft.homeScore, 10),
        away_score: parseInt(draft.awayScore, 10),
      };
    });

    const { error: rpcError } = await supabase.rpc('submit_bets', {
      p_bets: payload,
      p_bet_date: selectedDate,
    });

    if (rpcError) {
      showToast(`Erro ao lançar apostas: ${rpcError.message}`);
      return;
    }

    setSubmittedDates((prev) => new Set(prev).add(selectedDate));
    setDraftBets({}); // as apostas salvas passam a alimentar os campos
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
      showToast(`Erro ao salvar palpites: ${spError.message}`);
      return;
    }
    await loadAll(currentUser.uid, false);
    showToast('Palpites da Copa salvos!', 'success');
  };

  // Calcular ranking/classificação dos participantes (inclui os +5 dos especiais)
  const standings = useMemo<ParticipantStanding[]>(() => {
    return calculateStandings(participants, matches, bets, specials);
  }, [participants, matches, bets, specials]);

  // Prêmio acumulado: R$ 10 por dia desde 12/06 até o fim da Copa (19/07)
  const accumulatedPot = useMemo(() => calcAccumulatedPot(getTodayIso()), [nowTs]); // eslint-disable-line react-hooks/exhaustive-deps

  // ----------------------------------------------------
  // RENDERIZAÇÃO DA TELA DE LOGIN
  // ----------------------------------------------------
  if (currentScreen === 'login') {
    return (
      <div className="login-screen-container">
        <div className="login-banner-container">
          <img src="/imagens/login.webp" alt="Bandidos Apostados" className="login-banner-img" />
          <div className="login-ribbon-divider"></div>
        </div>

        <form onSubmit={handleLoginSubmit} className="login-form-container">
          <div className="login-form-group">
            <label className="login-field-label">Nome</label>
            <input
              type="text"
              className="login-field-input"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              placeholder="Digite seu nome"
            />
          </div>

          <div className="login-form-group">
            <label className="login-field-label">Senha</label>
            <input
              type="password"
              className="login-field-input"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Digite sua senha"
            />
          </div>

          <button type="submit" className="login-action-btn">
            ENTRAR
          </button>
        </form>

        {toastEl}
      </div>
    );
  }

  // ----------------------------------------------------
  // RENDERIZAÇÃO DA TELA DE SPLASH (INTRO.GIF)
  // ----------------------------------------------------
  if (currentScreen === 'splash') {
    return (
      <div className="splash-screen" onClick={() => setCurrentScreen('app')}>
        <img
          src="/imagens/intro.webp"
          alt="Carregando..."
          className="splash-gif"
        />
      </div>
    );
  }

  // ----------------------------------------------------
  // RENDERIZAÇÃO DO APP PRINCIPAL
  // ----------------------------------------------------
  return (
    <div className="app-container">
      {/* HEADER BANNER CARD (Apenas na aba de partidas) */}
      {activeTab === 'jogos' && (
        <div className="app-header-card-wrapper">
          <div className="app-header-card-gradient-border">
            <img src="/imagens/login.webp" alt="Bandidos Apostados Banner" className="app-header-card-img" />
          </div>
        </div>
      )}

      {/* CONTEÚDO PRINCIPAL */}
      <main style={{ flexGrow: 1, paddingBottom: '2.5rem' }}>
        {/* ABA: PARTIDAS & APOSTAS */}
        {activeTab === 'jogos' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {/* HORIZONTAL DATE SELECTOR BAR */}
            {dates.length > 0 && (
              <div className="date-selector-scroll-container">
                {dates.map((d) => {
                  const isTodayLabel = d.iso === getTodayIso();
                  const labelText = isTodayLabel ? `Hoje ${d.label}` : d.label;
                  const isSelected = selectedDate === d.iso;

                  return (
                    <button
                      key={d.iso}
                      className={`date-pill-btn-p16 ${isSelected ? 'active' : ''}`}
                      onClick={() => setSelectedDateState(d.iso)}
                    >
                      {labelText}
                    </button>
                  );
                })}
              </div>
            )}

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
                  {activeDateMatches.map((match) => {
                    // Determinar se o jogo já começou ou terminou
                    const hasGameStarted = match.status === 'finished' || !isGameInFuture(match.kickoff, nowTs);

                    // Aposta editável até 1 minuto antes do kickoff (mesmo depois de lançada)
                    const isTodayTab = selectedDate === getTodayIso();
                    const canEditBet = isTodayTab && match.status === 'scheduled' && isBettable(match.kickoff, nowTs);

                    // Determinar vencedor para destaque visual
                    const isFinished = match.status === 'finished';
                    const homeFinalWinner = isFinished && match.homeScore !== null && match.awayScore !== null && match.homeScore > match.awayScore;
                    const awayFinalWinner = isFinished && match.homeScore !== null && match.awayScore !== null && match.awayScore > match.homeScore;

                    // Vencedor parcial em tempo real (jogo acontecendo)
                    const isLiveGame = hasGameStarted && !isFinished;
                    const homeLiveWinner = isLiveGame && match.homeScore !== null && match.awayScore !== null && match.homeScore > match.awayScore;
                    const awayLiveWinner = isLiveGame && match.homeScore !== null && match.awayScore !== null && match.awayScore > match.homeScore;

                    const homeClasses = [
                      'team-row-p16',
                      homeFinalWinner ? 'winner-highlight' : '',
                      awayFinalWinner ? 'loser-fade' : '',
                      homeLiveWinner ? 'live-winner' : '',
                      awayLiveWinner ? 'live-loser-fade' : ''
                    ].filter(Boolean).join(' ');

                    const awayClasses = [
                      'team-row-p16',
                      awayFinalWinner ? 'winner-highlight' : '',
                      homeFinalWinner ? 'loser-fade' : '',
                      awayLiveWinner ? 'live-winner' : '',
                      homeLiveWinner ? 'live-loser-fade' : ''
                    ].filter(Boolean).join(' ');

                    return (
                      <div key={match.id} className={`game-card-item-p16 ${match.isLive ? 'live-card-highlight' : ''}`}>

                        {/* Cabeçalho do Jogo (Grupo e Horário) */}
                        <div className="game-card-header-p16" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span>{match.group} - {match.time}</span>
                          {match.isLive && (
                            <span className="live-badge-p16">
                              <span className="live-dot-p16"></span>
                              AO VIVO
                            </span>
                          )}
                        </div>

                        {/* Corpo do Confronto */}
                        <div className="game-card-body-p16">
                          {/* Time 1 (Mandante) */}
                          <div className={homeClasses}>
                            <div className="team-flag-badge-p16">
                              <img
                                src={flagSrc(match.homeFlag, 80)}
                                alt={match.homeTeam}
                                className="team-flag-img-p16"
                                onError={(e) => {
                                  e.currentTarget.src = 'https://flagcdn.com/w40/un.png';
                                }}
                              />
                            </div>
                            <div className="team-code-badge-p16">
                              {match.homeTeam}
                            </div>

                            {/* Caixa de Score */}
                            {canEditBet ? (
                              <input
                                type="number"
                                min="0"
                                className="score-input-field-p16"
                                value={displayDrafts[match.id]?.homeScore || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === '' || parseInt(val) >= 0) {
                                    setDraftBets((prev) => ({
                                      ...prev,
                                      [match.id]: { ...prev[match.id], homeScore: val }
                                    }));
                                  }
                                }}
                              />
                            ) : (
                              <div className="score-display-box-p16">
                                {hasGameStarted ? (match.homeScore !== null ? match.homeScore : '-') : (displayDrafts[match.id]?.homeScore || '-')}
                              </div>
                            )}
                          </div>

                          {/* Time 2 (Visitante) */}
                          <div className={awayClasses}>
                            <div className="team-flag-badge-p16">
                              <img
                                src={flagSrc(match.awayFlag, 80)}
                                alt={match.awayTeam}
                                className="team-flag-img-p16"
                                onError={(e) => {
                                  e.currentTarget.src = 'https://flagcdn.com/w40/un.png';
                                }}
                              />
                            </div>
                            <div className="team-code-badge-p16">
                              {match.awayTeam}
                            </div>

                            {/* Caixa de Score */}
                            {canEditBet ? (
                              <input
                                type="number"
                                min="0"
                                className="score-input-field-p16"
                                value={displayDrafts[match.id]?.awayScore || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === '' || parseInt(val) >= 0) {
                                    setDraftBets((prev) => ({
                                      ...prev,
                                      [match.id]: { ...prev[match.id], awayScore: val }
                                    }));
                                  }
                                }}
                              />
                            ) : (
                              <div className="score-display-box-p16">
                                {hasGameStarted ? (match.awayScore !== null ? match.awayScore : '-') : (displayDrafts[match.id]?.awayScore || '-')}
                              </div>
                            )}
                          </div>
                        </div>

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
                            const bet = bets.find((b) => b.matchId === match.id && b.participantId === p.id);
                            const analysis = analyzeBet(bet, match);

                            // Lógica do Badge de Pontos
                            let pointsBadgeClass = 'wrong';
                            let pointsText = '0 pts';
                            if (analysis.type === 'exact') {
                              pointsBadgeClass = 'exact';
                              pointsText = '+3 pts (Placar)';
                            } else if (analysis.type === 'draw') {
                              pointsBadgeClass = 'draw';
                              pointsText = '+2 pts (Empate)';
                            } else if (analysis.type === 'winner') {
                              pointsBadgeClass = 'winner';
                              pointsText = '+1 pt (Vence)';
                            } else if (analysis.type === 'pending') {
                              pointsBadgeClass = 'pending';
                              pointsText = 'Pendente';
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

                            return (
                              <div key={p.id} className="inline-guess-row-p16">
                                <div className="inline-guess-user-info-p16">
                                  <div className="inline-guess-avatar-border-p16">
                                    <img
                                      src={`/imagens/ranking ${p.id}.webp`}
                                      alt={p.name}
                                      className="inline-guess-avatar-img-p16"
                                      onError={(e) => {
                                        e.currentTarget.src = p.avatarUrl;
                                      }}
                                    />
                                  </div>
                                  <span className="inline-guess-username-p16">{p.name}</span>
                                </div>

                                <div className="inline-guess-result-info-p16">
                                  {bet ? (
                                    <div className="inline-guess-scores-container-p16">
                                      <span className="inline-guess-score-text-p16">
                                        {bet.homeScore} x {bet.awayScore}
                                      </span>
                                      {predictedWinnerFlag && (
                                        <img
                                          src={flagSrc(predictedWinnerFlag, 40)}
                                          alt="Palpite Vencedor"
                                          className="inline-guess-winner-flag-p16"
                                        />
                                      )}
                                    </div>
                                  ) : (
                                    <span className="inline-guess-none-text-p16">Sem Palpite</span>
                                  )}

                                  <div className={`inline-guess-badge-p16 ${pointsBadgeClass}`}>
                                    {pointsText}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#15110E', fontWeight: 600 }}>
                  Nenhum jogo agendado para esta data.
                </div>
              )}

              {/* ACTION BAR DE LANÇAMENTO (Só exibe se estivermos na aba de Hoje e houver partidas jogáveis) */}
              {selectedDate === getTodayIso() && playableMatches.length > 0 && (
                <div className="launch-action-bar-p16">
                  <div className="launch-edit-icon-circle-p16">
                    {isSubmittedForSelectedDate && !hasChangesToLaunch ? <CheckSquare size={18} color="#ffffff" /> : <PencilLine size={18} color="#ffffff" />}
                  </div>

                  {isSubmittedForSelectedDate && !hasChangesToLaunch ? (
                    <button className="launch-bet-btn-p16 submitted" disabled>
                      APOSTA LANÇADA
                    </button>
                  ) : (
                    <button
                      className={`launch-bet-btn-p16 ${areAllPredictionsFilled ? 'active' : ''}`}
                      disabled={!areAllPredictionsFilled}
                      onClick={handleLaunchBets}
                    >
                      LANÇAR APOSTA
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

        {/* ABA: PALPITES (especiais + histórico pessoal) */}
        {activeTab === 'palpites' && currentUser && (
          <PalpitesTab
            matches={matches}
            bets={bets}
            participants={participants}
            specials={specials}
            currentUser={currentUser}
            nowTs={nowTs}
            onSave={handleSaveSpecial}
          />
        )}

        {/* ABA: PAGAMENTO (PIX) */}
        {activeTab === 'pix' && (
          <PixTab accumulated={accumulatedPot} />
        )}

        {/* ABA: RANKING */}
        {activeTab === 'ranking' && (
          <div>
            <StandingsTable standings={standings} />

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
      </main>

      {/* BARRA DE NAVEGAÇÃO INFERIOR */}
      <nav className="bottom-nav">
        <button
          className={`nav-item ${activeTab === 'jogos' ? 'active' : ''}`}
          onClick={() => setActiveTab('jogos')}
        >
          <Calendar size={20} />
          <span>Partidas</span>
        </button>
        <button
          className={`nav-item ${activeTab === 'palpites' ? 'active' : ''}`}
          onClick={() => setActiveTab('palpites')}
        >
          <ListChecks size={20} />
          <span>Palpites</span>
        </button>
        <button
          className={`nav-item ${activeTab === 'ranking' ? 'active' : ''}`}
          onClick={() => setActiveTab('ranking')}
        >
          <Trophy size={20} />
          <span>Ranking</span>
        </button>
        <button
          className={`nav-item ${activeTab === 'pix' ? 'active' : ''}`}
          onClick={() => setActiveTab('pix')}
        >
          <Wallet size={20} />
          <span>Pagamento</span>
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
