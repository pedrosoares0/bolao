// ============================================================
// BracketTab — aba "Chaveamento". Mostra a fase de grupos (classificação) e a
// chave do mata-mata no formato "janela de 3 fases" (estilo Sofascore): um
// seletor de fase (dropdown + setas) desliza por 16avos → final, com a fase
// escolhida em destaque ao centro e as vizinhas dos lados, conectores em
// cotovelo e botão de tela cheia. Puramente leitura: deriva tudo dos `matches`.
// ============================================================
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import type { Match } from '../types';
import { flagSrc, translateTeam, flagOf } from '../lib/teamMaps';
import { computeGroupStandings, computeBestThirds } from '../utils/groups';

interface BracketTabProps {
  matches: Match[];
}

const TBD = 'A definir';
const isTbd = (s: string) => !s || s === TBD;

// ---- Enriquecimento do mata-mata pela ESPN, DIRETO DO NAVEGADOR ----
// A football-data deixa os dois lados nulos ('A definir') até a fase de grupos
// fechar, e a ESPN servida ao nosso servidor (Netlify, região US) vem atrasada.
// Mas a ESPN entrega os times já definidos com Access-Control-Allow-Origin: *,
// e o navegador do usuário (no Brasil) cai num edge atualizado. Então buscamos a
// ESPN aqui no cliente e completamos o chaveamento na tela — sem depender da
// região do servidor. Só preenche um lado quando o nome da ESPN casa com uma
// seleção REAL da Copa (as da fase de grupos); placeholders ("Group F 2nd
// Place", "Round of 32 1 Winner") são ignorados.
const TEAM_ALIAS: Record<string, string> = {
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
const normTeam = (s: string): string => {
  const base = (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return TEAM_ALIAS[base] ?? base;
};
const ESPN_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';
const KO_HORIZON_MS = 14 * 24 * 60 * 60 * 1000; // só busca o mata-mata dos próximos ~14 dias

// Fases da árvore, da esquerda (16avos) à direita (final). 3º lugar fica à parte.
const TREE_ORDER = ['LAST_32', 'LAST_16', 'QUARTER_FINALS', 'SEMI_FINALS', 'FINAL'];

// Rótulos das fases (iguais ao Sofascore PT).
const STAGE_LABEL: Record<string, string> = {
  LAST_32: '16Avos-de-final',
  LAST_16: 'Oitavos-de-Final',
  QUARTER_FINALS: 'Quartas de final',
  SEMI_FINALS: 'Semifinais',
  THIRD_PLACE: 'Disputa do 3º Lugar',
  FINAL: 'Final',
};

// Ordem/nome das fases do mata-mata (inclui 3º lugar, fora da árvore principal).
const KNOCKOUT_STAGES: { key: string; label: string }[] = [
  { key: 'LAST_32', label: STAGE_LABEL.LAST_32 },
  { key: 'LAST_16', label: STAGE_LABEL.LAST_16 },
  { key: 'QUARTER_FINALS', label: STAGE_LABEL.QUARTER_FINALS },
  { key: 'SEMI_FINALS', label: STAGE_LABEL.SEMI_FINALS },
  { key: 'THIRD_PLACE', label: STAGE_LABEL.THIRD_PLACE },
  { key: 'FINAL', label: STAGE_LABEL.FINAL },
];

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
// "29/06" -> "29 de jun."
const dateLabel = (d: string): string => {
  const [dd, mm] = (d || '').split('/');
  const mi = parseInt(mm, 10) - 1;
  if (!dd || isNaN(mi) || !MONTHS[mi]) return d || '';
  return `${parseInt(dd, 10)} de ${MONTHS[mi]}.`;
};

// Quem venceu (considera a coluna winner — cobre pênaltis; senão o placar).
const winnerSide = (m: Match): 'home' | 'away' | null => {
  if (m.status !== 'finished') return null;
  if (m.winner === 'HOME_TEAM') return 'home';
  if (m.winner === 'AWAY_TEAM') return 'away';
  if (m.winner === 'DRAW') return null;
  if (m.homeScore === null || m.awayScore === null) return null;
  if (m.homeScore > m.awayScore) return 'home';
  if (m.awayScore > m.homeScore) return 'away';
  return null;
};

const fmtLiveClock = (clock?: string | null): string | null => {
  if (!clock) return null;
  const n = clock.trim().toUpperCase();
  if (n === 'HT' || n === 'HALFTIME' || n === 'HALF TIME') return 'Intervalo';
  return clock;
};

type Stage = { key: string; label: string; games: Match[] };

// Linha de um time dentro do card do confronto.
function TeamLine({
  flag,
  name,
  score,
  showScore,
  state,
}: {
  flag: string;
  name: string;
  score: number | null;
  showScore: boolean;
  state: 'win' | 'lose' | '';
}) {
  return (
    <div className={`brk2-row ${state}`}>
      <img
        loading="lazy"
        decoding="async"
        src={flagSrc(flag, 40)}
        alt=""
        className="brk2-flag"
        onError={(e) => {
          e.currentTarget.src = 'https://flagcdn.com/w40/un.png';
        }}
      />
      <span className="brk2-name">{name}</span>
      {showScore && <span className="brk2-score">{score ?? '-'}</span>}
    </div>
  );
}

// Card de um confronto (2 linhas). À direita: placar (se jogado/ao vivo) ou
// data/hora. Marca o vencedor e um selo opcional (Final / 3º lugar).
function KnoMatchCard({ m, badge }: { m: Match; badge?: string }) {
  const win = winnerSide(m);
  const finished = m.status === 'finished';
  const live = !!m.isLive;
  const showScore = finished || live;
  const homeName = isTbd(m.homeTeamEn) ? TBD : m.homeTeam;
  const awayName = isTbd(m.awayTeamEn) ? TBD : m.awayTeam;

  return (
    <div
      data-mid={m.id}
      className={`brk2-card ${finished ? 'finished' : ''} ${live ? 'live' : ''}`}
      title={`${homeName} x ${awayName}`}
    >
      <div className="brk2-rows">
        <TeamLine flag={m.homeFlag} name={homeName} score={m.homeScore} showScore={showScore} state={win === 'home' ? 'win' : win === 'away' ? 'lose' : ''} />
        <TeamLine flag={m.awayFlag} name={awayName} score={m.awayScore} showScore={showScore} state={win === 'away' ? 'win' : win === 'home' ? 'lose' : ''} />
      </div>

      {!showScore && (
        <div className="brk2-foot">
          <span className="brk2-date">{dateLabel(m.date)}</span>
          <span className="brk2-sep">·</span>
          <span className="brk2-time">{m.time}</span>
        </div>
      )}
      {live && <span className="brk2-livedot">{fmtLiveClock(m.liveClock) ?? 'AO VIVO'}</span>}
      {badge && <span className="brk2-badge">{badge}</span>}
    </div>
  );
}

// Conexão (cotovelo) entre um card e seu "pai" na fase seguinte.
type Connection = { fromId: string; toId: string };
type ConnPath = { d: string };

function BracketTab({ matches }: BracketTabProps) {
  const [view, setView] = useState<'grupos' | 'mata'>('grupos');

  // ---- Classificação dos grupos ----
  const groups = useMemo(() => computeGroupStandings(matches), [matches]);
  const bestThirds = useMemo(() => computeBestThirds(groups), [groups]);
  const showThirds = bestThirds.some((t) => t.played > 0);

  // ---- ESPN no cliente: completa os times do mata-mata (ver nota no topo) ----
  // Índice das seleções REAIS da Copa (nome normalizado -> nome em inglês do
  // football-data), tirado da fase de grupos — usado para validar o que a ESPN
  // traz e gravar o nome no padrão que o teamMaps entende (bandeira/tradução).
  const knownByNorm = useMemo(() => {
    const map = new Map<string, string>();
    matches.forEach((m) => {
      if (m.stage !== 'GROUP_STAGE') return;
      if (!isTbd(m.homeTeamEn)) map.set(normTeam(m.homeTeamEn), m.homeTeamEn);
      if (!isTbd(m.awayTeamEn)) map.set(normTeam(m.awayTeamEn), m.awayTeamEn);
    });
    return map;
  }, [matches]);

  // Datas (AAAAMMDD) do mata-mata ainda com algum lado indefinido. Como string
  // estável: o efeito de busca só re-dispara quando esse conjunto muda (e não a
  // cada placar ao vivo). Sem datas (tudo definido) => não bate na ESPN. O corte
  // de horizonte (próximos dias) fica no efeito, que pode usar o relógio.
  const missingKoDatesKey = useMemo(() => {
    const dates = new Set<string>();
    matches.forEach((m) => {
      if (m.stage === 'GROUP_STAGE') return;
      if (!isTbd(m.homeTeamEn) && !isTbd(m.awayTeamEn)) return;
      if (m.kickoff) dates.add(m.kickoff.slice(0, 10).replace(/-/g, ''));
    });
    return Array.from(dates).sort().join(',');
  }, [matches]);

  // kickoff (epoch ms) -> seleções reais que a ESPN já definiu para o confronto.
  const [espnFill, setEspnFill] = useState<Map<number, { home?: string; away?: string }>>(new Map());
  // Espelho do índice de seleções conhecidas, lido só dentro do efeito (refs não
  // podem ser acessadas no render). Mantém o efeito fora de `knownByNorm` nas deps.
  const knownRef = useRef(knownByNorm);
  useEffect(() => {
    knownRef.current = knownByNorm;
  }, [knownByNorm]);

  useEffect(() => {
    // AAAAMMDD -> epoch (UTC) para cortar o que está além do horizonte.
    const dateKeys = missingKoDatesKey
      .split(',')
      .filter(Boolean)
      .filter((dk) => {
        const t = Date.UTC(+dk.slice(0, 4), +dk.slice(4, 6) - 1, +dk.slice(6, 8));
        return t <= Date.now() + KO_HORIZON_MS;
      });
    // Nada faltando no horizonte: não busca. Um `espnFill` antigo é inofensivo —
    // enrichKo só usa o preenchimento em lados ainda 'A definir'.
    if (dateKeys.length === 0) return;
    let cancelled = false;

    const run = async () => {
      const known = knownRef.current;
      const fill = new Map<number, { home?: string; away?: string }>();
      await Promise.all(
        dateKeys.map(async (dk) => {
          try {
            const res = await fetch(`${ESPN_SCOREBOARD}?dates=${dk}&_=${Date.now()}`, { cache: 'no-store' });
            if (!res.ok) return;
            const data = await res.json();
            for (const ev of data.events ?? []) {
              const comp = ev.competitions?.[0];
              const competitors: Array<{ homeAway?: string; team?: { displayName?: string } }> = comp?.competitors ?? [];
              const home = competitors.find((c) => c.homeAway === 'home');
              const away = competitors.find((c) => c.homeAway === 'away');
              const k = Date.parse(ev.date ?? '');
              if (!k) continue;
              const hEn = known.get(normTeam(home?.team?.displayName ?? ''));
              const aEn = known.get(normTeam(away?.team?.displayName ?? ''));
              if (hEn || aEn) {
                const cur = fill.get(k) ?? {};
                if (hEn) cur.home = hEn;
                if (aEn) cur.away = aEn;
                fill.set(k, cur);
              }
            }
          } catch {
            /* ESPN indisponível no cliente — segue com o que o servidor já tem */
          }
        })
      );
      if (cancelled) return;
      // Só atualiza o estado se algo mudou (evita re-render à toa).
      setEspnFill((prev) => {
        if (prev.size === fill.size && Array.from(fill).every(([k, v]) => {
          const p = prev.get(k);
          return p && p.home === v.home && p.away === v.away;
        })) return prev;
        return fill;
      });
    };

    run();
    const id = window.setInterval(run, 5 * 60 * 1000); // re-busca a cada 5 min
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [missingKoDatesKey]);

  // Aplica o que a ESPN trouxe num jogo do mata-mata (só nos lados indefinidos).
  const enrichKo = useMemo(() => {
    return (m: Match): Match => {
      const needHome = isTbd(m.homeTeamEn);
      const needAway = isTbd(m.awayTeamEn);
      if (!needHome && !needAway) return m;
      const f = espnFill.get(Date.parse(m.kickoff));
      if (!f) return m;
      const out = { ...m };
      if (needHome && f.home) {
        out.homeTeamEn = f.home;
        out.homeTeam = translateTeam(f.home);
        out.homeFlag = flagOf(f.home, '');
      }
      if (needAway && f.away) {
        out.awayTeamEn = f.away;
        out.awayTeam = translateTeam(f.away);
        out.awayFlag = flagOf(f.away, '');
      }
      return out;
    };
  }, [espnFill]);

  // ---- Mata-mata por fase (com os times já completados pela ESPN) ----
  const knockout = useMemo<Stage[]>(() => {
    return KNOCKOUT_STAGES.map(({ key, label }) => ({
      key,
      label,
      games: matches
        .filter((m) => m.stage === key)
        .map(enrichKo)
        .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff)),
    })).filter((s) => s.games.length > 0);
  }, [matches, enrichKo]);

  const hasGroups = groups.length > 0;
  const hasKnockout = knockout.length > 0;

  // Fases da árvore (16avos → final) e a disputa de 3º lugar à parte.
  const treeStages = useMemo(() => knockout.filter((s) => TREE_ORDER.includes(s.key)), [knockout]);
  const thirdPlace = useMemo(() => knockout.find((s) => s.key === 'THIRD_PLACE') ?? null, [knockout]);

  // Fase em foco (a destacada). Por padrão segue o "jogo do momento".
  const defaultStageIdx = useMemo(() => {
    if (!treeStages.length) return 0;
    const live = treeStages.findIndex((s) => s.games.some((g) => g.isLive));
    if (live >= 0) return live;
    const next = treeStages.findIndex((s) => s.games.some((g) => g.status !== 'finished'));
    if (next >= 0) return next;
    return treeStages.length - 1;
  }, [treeStages]);

  // Fase em foco = escolha do usuário (se houver), senão segue o padrão.
  // Estado derivado (sem efeito) para evitar setState-em-effect.
  const [userStageIdx, setUserStageIdx] = useState<number | null>(null);
  const maxIdx = Math.max(0, treeStages.length - 1);
  const stageIdx = Math.min(userStageIdx ?? defaultStageIdx, maxIdx);
  // Direção da transição (avançar = desliza da direita; voltar = da esquerda).
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd');
  const pickStage = (i: number) => {
    const clamped = Math.max(0, Math.min(i, maxIdx));
    setDir(clamped >= stageIdx ? 'fwd' : 'back');
    setUserStageIdx(clamped);
  };

  // Janela de 2 colunas: a fase em foco + a seguinte (onde os vencedores vão).
  // Na última fase (Final) mostra a anterior + a Final. Cabe nome completo no
  // celular sem rolar pro lado; rola só pra baixo. Memoizada p/ não recriar o
  // array a cada render (senão o efeito dos conectores re-dispararia em loop).
  const windowStart = Math.min(stageIdx, Math.max(0, treeStages.length - 2));
  const visible = useMemo(
    () => treeStages.slice(windowStart, windowStart + 2),
    [treeStages, windowStart]
  );

  // Conexões entre colunas visíveis consecutivas (pares -> jogo pai).
  const connections = useMemo<Connection[]>(() => {
    const out: Connection[] = [];
    for (let c = 0; c < visible.length - 1; c += 1) {
      const a = visible[c].games;
      const b = visible[c + 1].games;
      if (!b.length) continue;
      a.forEach((g, i) => {
        const parent = b[Math.min(Math.floor(i / 2), b.length - 1)];
        if (g && parent) out.push({ fromId: g.id, toId: parent.id });
      });
    }
    return out;
  }, [visible]);

  // Linhas medidas da posição real dos cards no DOM (alinham em qualquer tela).
  const boardRef = useRef<HTMLDivElement>(null);
  const [conn, setConn] = useState<{ paths: ConnPath[]; w: number; h: number }>({ paths: [], w: 0, h: 0 });

  useLayoutEffect(() => {
    if (view !== 'mata') return;
    const board = boardRef.current;
    if (!board) return;

    const compute = () => {
      const bb = board.getBoundingClientRect();
      const rect = new Map<string, DOMRect>();
      board.querySelectorAll<HTMLElement>('[data-mid]').forEach((el) => {
        if (el.dataset.mid) rect.set(el.dataset.mid, el.getBoundingClientRect());
      });
      const paths: ConnPath[] = [];
      for (const c of connections) {
        const f = rect.get(c.fromId);
        const t = rect.get(c.toId);
        if (!f || !t) continue;
        const x1 = f.right - bb.left;
        const y1 = f.top + f.height / 2 - bb.top;
        const x2 = t.left - bb.left;
        const y2 = t.top + t.height / 2 - bb.top;
        const midX = (x1 + x2) / 2;
        paths.push({ d: `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}` });
      }
      // Só atualiza se algo realmente mudou — evita loop com o ResizeObserver.
      setConn((prev) => {
        const same =
          prev.w === bb.width &&
          prev.h === bb.height &&
          prev.paths.length === paths.length &&
          prev.paths.every((p, i) => p.d === paths[i].d);
        return same ? prev : { paths, w: bb.width, h: bb.height };
      });
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(board);
    window.addEventListener('resize', compute);
    document.fonts?.ready?.then(compute).catch(() => {});
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', compute);
    };
  }, [connections, view, stageIdx]);

  // Tela cheia do quadro.
  const fsRef = useRef<HTMLDivElement>(null);
  const [isFs, setIsFs] = useState(false);
  useEffect(() => {
    const onChange = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const toggleFullscreen = () => {
    const el = fsRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else el.requestFullscreen?.().catch(() => {});
  };

  // Trocar de fase arrastando pro lado (swipe) — além das setas. Só dispara em
  // gestos predominantemente horizontais, pra não atrapalhar o scroll vertical.
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  const wheelLock = useRef(0);
  const onPointerDown = (e: React.PointerEvent) => {
    swipeRef.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const s = swipeRef.current;
    swipeRef.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      pickStage(stageIdx + (dx < 0 ? 1 : -1));
    }
  };
  const onWheel = (e: React.WheelEvent) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || Math.abs(e.deltaX) < 24) return;
    const now = Date.now();
    if (now < wheelLock.current) return;
    wheelLock.current = now + 500;
    pickStage(stageIdx + (e.deltaX > 0 ? 1 : -1));
  };

  return (
    <div className="brk-tab">
      <h1 className="brk-page-title">CHAVEAMENTO</h1>

      <div className="brk-toggle">
        <button className={`brk-toggle-btn ${view === 'grupos' ? 'active' : ''}`} onClick={() => setView('grupos')}>
          Grupos
        </button>
        <button className={`brk-toggle-btn ${view === 'mata' ? 'active' : ''}`} onClick={() => setView('mata')}>
          Mata-mata
        </button>
      </div>

      {view === 'grupos' && (
        <div className="brk-groups">
          {!hasGroups && <div className="brk-empty">Grupos ainda não disponíveis.</div>}
          {groups.map(({ label, rows }) => (
            <div key={label} className="brk-group-card">
              <div className="brk-group-title">{label}</div>
              <div className="brk-table">
                <div className="brk-table-head">
                  <span className="brk-col-team">Time</span>
                  <span className="brk-col-stat">P</span>
                  <span className="brk-col-stat">V</span>
                  <span className="brk-col-stat">E</span>
                  <span className="brk-col-stat">D</span>
                  <span className="brk-col-stat">SG</span>
                  <span className="brk-col-pts">Pts</span>
                </div>
                {rows.map((r, i) => {
                  const sg = r.gf - r.ga;
                  return (
                    <div key={r.en} className={`brk-table-row ${i < 2 ? 'qualified' : ''}`}>
                      <span className="brk-col-team">
                        <span className="brk-pos">{i + 1}</span>
                        <img
                          loading="lazy"
                          decoding="async"
                          src={flagSrc(r.flag, 40)}
                          alt={r.name}
                          className="brk-flag"
                          onError={(e) => { e.currentTarget.src = 'https://flagcdn.com/w40/un.png'; }}
                        />
                        <span className="brk-team-name">{r.name}</span>
                      </span>
                      <span className="brk-col-stat">{r.played}</span>
                      <span className="brk-col-stat">{r.won}</span>
                      <span className="brk-col-stat">{r.drawn}</span>
                      <span className="brk-col-stat">{r.lost}</span>
                      <span className="brk-col-stat">{sg > 0 ? `+${sg}` : sg}</span>
                      <span className="brk-col-pts">{r.pts}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {showThirds && (
            <div className="brk-group-card brk-thirds-card">
              <div className="brk-group-title">Melhores Terceiros</div>
              <div className="brk-thirds-sub">As 8 melhores seleções em 3º lugar avançam.</div>
              <div className="brk-table">
                <div className="brk-table-head">
                  <span className="brk-col-team">Time</span>
                  <span className="brk-col-stat">P</span>
                  <span className="brk-col-stat">V</span>
                  <span className="brk-col-stat">E</span>
                  <span className="brk-col-stat">D</span>
                  <span className="brk-col-stat">SG</span>
                  <span className="brk-col-pts">Pts</span>
                </div>
                {bestThirds.map((t, i) => {
                  const tsg = t.gf - t.ga;
                  return (
                    <div key={t.en} className={`brk-table-row ${t.qualified ? 'qualified' : 'eliminated'}`}>
                      <span className="brk-col-team">
                        <span className="brk-pos">{i + 1}</span>
                        <img
                          loading="lazy" decoding="async"
                          src={flagSrc(t.flag, 40)}
                          alt={t.name}
                          className="brk-flag"
                          onError={(e) => { e.currentTarget.src = 'https://flagcdn.com/w40/un.png'; }}
                        />
                        <span className="brk-team-name">{t.name}</span>
                        <span className="brk-thirds-group">{t.group.replace('Grupo ', '')}</span>
                      </span>
                      <span className="brk-col-stat">{t.played}</span>
                      <span className="brk-col-stat">{t.won}</span>
                      <span className="brk-col-stat">{t.drawn}</span>
                      <span className="brk-col-stat">{t.lost}</span>
                      <span className="brk-col-stat">{tsg > 0 ? `+${tsg}` : tsg}</span>
                      <span className="brk-col-pts">{t.pts}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {view === 'mata' && (
        !hasKnockout ? (
          <div className="brk-empty">O mata-mata começa após a fase de grupos.</div>
        ) : (
          <div className="brk2" ref={fsRef}>
            {/* Barra de navegação de fases */}
            <div className="brk2-bar">
              <button
                className="brk2-arrow"
                onClick={() => pickStage(stageIdx - 1)}
                disabled={stageIdx <= 0}
                aria-label="Fase anterior"
              >
                ‹
              </button>

              <div className="brk2-select-wrap">
                <select
                  className="brk2-select"
                  value={stageIdx}
                  onChange={(e) => pickStage(Number(e.target.value))}
                  aria-label="Selecionar fase"
                >
                  {treeStages.map((s, i) => (
                    <option key={s.key} value={i}>
                      {STAGE_LABEL[s.key] ?? s.label}
                    </option>
                  ))}
                </select>
                <span className="brk2-select-caret" aria-hidden="true">▾</span>
              </div>

              <button
                className="brk2-arrow"
                onClick={() => pickStage(stageIdx + 1)}
                disabled={stageIdx >= treeStages.length - 1}
                aria-label="Próxima fase"
              >
                ›
              </button>

              <button
                className="brk2-fs"
                onClick={toggleFullscreen}
                aria-label={isFs ? 'Sair da tela cheia' : 'Tela cheia'}
                title={isFs ? 'Sair da tela cheia' : 'Tela cheia'}
              >
                {isFs ? '✕' : '⛶'}
              </button>
            </div>

            {/* Área que captura o swipe horizontal (arrastar pro lado troca de
                fase). O scroll vertical segue normal. */}
            <div
              className="brk2-scroll"
              onPointerDown={onPointerDown}
              onPointerUp={onPointerUp}
              onPointerCancel={() => { swipeRef.current = null; }}
              onWheel={onWheel}
            >
              {/* Quadro com as colunas + conectores. A key por fase reinicia a
                  animação de slide ao trocar de fase. */}
              <div className={`brk2-board brk2-anim-${dir}`} key={stageIdx} ref={boardRef}>
              <svg
                className="brk2-lines"
                width={conn.w}
                height={conn.h}
                viewBox={`0 0 ${conn.w || 1} ${conn.h || 1}`}
                aria-hidden="true"
              >
                {conn.paths.map((p, i) => (
                  <path key={i} d={p.d} className="brk2-line" vectorEffect="non-scaling-stroke" />
                ))}
              </svg>

              {visible.map((s) => {
                const absIdx = windowStart + visible.indexOf(s);
                const focus = absIdx === stageIdx;
                const isFinalCol = s.key === 'FINAL';
                return (
                  <div key={s.key} className={`brk2-col ${focus ? 'focus' : ''} ${isFinalCol ? 'final' : ''}`}>
                    <div className="brk2-col-head">{STAGE_LABEL[s.key] ?? s.label}</div>
                    <div className="brk2-col-body">
                      {s.games.map((m) => (
                        <KnoMatchCard key={m.id} m={m} badge={isFinalCol ? 'Final' : undefined} />
                      ))}
                      {/* Disputa de 3º lugar acompanha a coluna da Final */}
                      {isFinalCol && thirdPlace?.games.map((m) => (
                        <KnoMatchCard key={m.id} m={m} badge="3º lugar" />
                      ))}
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
}

export default BracketTab;
