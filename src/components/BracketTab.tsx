// ============================================================
// BracketTab — aba "Chaveamento". Mostra a fase de grupos (classificação +
// placares de cada grupo) e a chave do mata-mata (16 avos → final) com os
// placares e o time vencedor destacado. Puramente leitura: deriva tudo dos
// `matches` já carregados em App.tsx (não vai ao banco).
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import type { Match } from '../types';
import { flagSrc } from '../lib/teamMaps';
import { computeGroupStandings, computeBestThirds } from '../utils/groups';

interface BracketTabProps {
  matches: Match[];
}

const TBD = 'A definir';
const isTbd = (s: string) => !s || s === TBD;

// Fases que compõem a árvore da chave, da esquerda (16 avos) à direita (final).
// A disputa de 3º lugar fica fora da árvore (é mostrada à parte).
const TREE_ORDER = ['LAST_32', 'LAST_16', 'QUARTER_FINALS', 'SEMI_FINALS', 'FINAL'];
const SIDE_ORDER = ['LAST_32', 'LAST_16', 'QUARTER_FINALS', 'SEMI_FINALS'];
const STAGE_SHORT_LABEL: Record<string, string> = {
  LAST_32: '16 avos',
  LAST_16: 'Oitavas',
  QUARTER_FINALS: 'Quartas',
  SEMI_FINALS: 'Semi',
  FINAL: 'Final',
};

// Ordem e nome das fases do mata-mata
const KNOCKOUT_STAGES: { key: string; label: string }[] = [
  { key: 'LAST_32', label: '16 avos de Final' },
  { key: 'LAST_16', label: 'Oitavas de Final' },
  { key: 'QUARTER_FINALS', label: 'Quartas de Final' },
  { key: 'SEMI_FINALS', label: 'Semifinal' },
  { key: 'THIRD_PLACE', label: 'Disputa do 3º Lugar' },
  { key: 'FINAL', label: 'Final' },
];

// Quem venceu (considera a coluna winner — cobre pênaltis; senão o placar)
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

const matchStatusLabel = (m: Match) => {
  if (m.isLive) return `Ao vivo${fmtLiveClock(m.liveClock) ? ` · ${fmtLiveClock(m.liveClock)}` : ''}`;
  if (m.status === 'finished') return 'Encerrado';
  return `${m.date} · ${m.time}`;
};

function CompactMatchCard({
  m,
  focus = false,
  selected = false,
  onSelect,
}: {
  m: Match;
  focus?: boolean;
  selected?: boolean;
  onSelect?: (id: string) => void;
}) {
  const win = winnerSide(m);
  const finished = m.status === 'finished';
  const live = !!m.isLive;
  const showScore = finished || live;
  const title = `${isTbd(m.homeTeamEn) ? TBD : m.homeTeam} x ${isTbd(m.awayTeamEn) ? TBD : m.awayTeam}`;

  return (
    <button
      type="button"
      className={`brk-mini-match ${focus ? 'focus' : ''} ${selected ? 'selected' : ''} ${finished ? 'finished' : ''} ${live ? 'live' : ''}`}
      title={title}
      aria-label={title}
      aria-pressed={selected}
      onClick={() => onSelect?.(m.id)}
    >
      <div className={`brk-mini-team ${win === 'home' ? 'win' : win === 'away' ? 'lose' : ''}`}>
        <img
          loading="lazy"
          decoding="async"
          src={flagSrc(m.homeFlag, 40)}
          alt={m.homeTeam}
          className="brk-mini-flag"
          onError={(e) => { e.currentTarget.src = 'https://flagcdn.com/w40/un.png'; }}
        />
        <span className="brk-mini-score">
          {showScore && m.homeScore !== null ? m.homeScore : '-'}
        </span>
      </div>
      <span className="brk-mini-versus" aria-hidden="true">x</span>
      <div className={`brk-mini-team ${win === 'away' ? 'win' : win === 'home' ? 'lose' : ''}`}>
        <img
          loading="lazy"
          decoding="async"
          src={flagSrc(m.awayFlag, 40)}
          alt={m.awayTeam}
          className="brk-mini-flag"
          onError={(e) => { e.currentTarget.src = 'https://flagcdn.com/w40/un.png'; }}
        />
        <span className="brk-mini-score">
          {showScore && m.awayScore !== null ? m.awayScore : '-'}
        </span>
      </div>
    </button>
  );
}

function MatchDetail({ match }: { match: Match }) {
  const finished = match.status === 'finished';
  const live = !!match.isLive;
  const showScore = finished || live;

  return (
    <div className={`brk-match-detail ${live ? 'live' : ''}`}>
      <div className="brk-detail-team">
        <img
          loading="lazy"
          decoding="async"
          src={flagSrc(match.homeFlag, 40)}
          alt={match.homeTeam}
          className="brk-detail-flag"
          onError={(e) => { e.currentTarget.src = 'https://flagcdn.com/w40/un.png'; }}
        />
        <span>{isTbd(match.homeTeamEn) ? TBD : match.homeTeam}</span>
      </div>
      <div className="brk-detail-score">
        <span>{showScore && match.homeScore !== null ? match.homeScore : '-'}</span>
        <strong>x</strong>
        <span>{showScore && match.awayScore !== null ? match.awayScore : '-'}</span>
      </div>
      <div className="brk-detail-team right">
        <span>{isTbd(match.awayTeamEn) ? TBD : match.awayTeam}</span>
        <img
          loading="lazy"
          decoding="async"
          src={flagSrc(match.awayFlag, 40)}
          alt={match.awayTeam}
          className="brk-detail-flag"
          onError={(e) => { e.currentTarget.src = 'https://flagcdn.com/w40/un.png'; }}
        />
      </div>
      <div className="brk-detail-meta">{matchStatusLabel(match)}</div>
    </div>
  );
}

type MiniRound = {
  key: string;
  label: string;
  games: Match[];
};

type ConnectorPath = {
  d: string;
  side: 'left' | 'right';
};

const ROUND_VERTICAL_PAD: Record<string, number> = {
  LAST_32: 0,
  LAST_16: 6,
  QUARTER_FINALS: 16,
  SEMI_FINALS: 0,
};

const slotY = (round: MiniRound, index: number) => {
  const count = Math.max(round.games.length, 1);
  const pad = ROUND_VERTICAL_PAD[round.key] ?? 0;
  return pad + ((index + 0.5) / count) * (100 - pad * 2);
};

function buildConnectorPaths(leftRounds: MiniRound[], rightRounds: MiniRound[], finalGame?: Match): ConnectorPath[] {
  const paths: ConnectorPath[] = [];
  const leftX = [7, 18.5, 30, 41.5];
  const rightX = [93, 81.5, 70, 58.5];
  const finalY = 50;

  const connectSide = (rounds: MiniRound[], xs: number[], side: 'left' | 'right') => {
    for (let roundIndex = 0; roundIndex < rounds.length - 1; roundIndex += 1) {
      const from = rounds[roundIndex];
      const to = rounds[roundIndex + 1];
      if (!from.games.length || !to.games.length) continue;

      from.games.forEach((_, gameIndex) => {
        const targetIndex = Math.min(Math.floor(gameIndex / 2), to.games.length - 1);
        const x1 = xs[roundIndex];
        const x2 = xs[roundIndex + 1];
        const midX = (x1 + x2) / 2;
        const y1 = slotY(from, gameIndex);
        const y2 = slotY(to, targetIndex);
        paths.push({ side, d: `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}` });
      });
    }
  };

  connectSide(leftRounds, leftX, 'left');
  connectSide(rightRounds, rightX, 'right');

  if (finalGame) {
    const leftSemi = leftRounds[leftRounds.length - 1];
    const rightSemi = rightRounds[rightRounds.length - 1];
    if (leftSemi?.games.length) {
      paths.push({ side: 'left', d: `M ${leftX[3]} ${slotY(leftSemi, 0)} H 48 V ${finalY} H 50` });
    }
    if (rightSemi?.games.length) {
      paths.push({ side: 'right', d: `M ${rightX[3]} ${slotY(rightSemi, 0)} H 52 V ${finalY} H 50` });
    }
  }

  return paths;
}

function MiniRoundColumn({
  round,
  selectedMatchId,
  onSelectMatch,
}: {
  round: MiniRound;
  selectedMatchId: string | null;
  onSelectMatch: (id: string) => void;
}) {
  const focus = round.key === 'SEMI_FINALS';

  return (
    <div className={`brk-mini-round brk-mini-round-${round.key.toLowerCase()}`}>
      <div className="brk-mini-round-label">{round.label}</div>
      <div className="brk-mini-slots" style={{ '--slot-count': Math.max(round.games.length, 1) } as React.CSSProperties}>
        {round.games.map((m) => (
          <div key={m.id} className="brk-mini-slot">
            <CompactMatchCard
              m={m}
              focus={focus}
              selected={selectedMatchId === m.id}
              onSelect={onSelectMatch}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function BracketTab({ matches }: BracketTabProps) {
  const [view, setView] = useState<'grupos' | 'mata'>('grupos');

  // ---- Classificação dos grupos (com desempate por confronto direto) ----
  const groups = useMemo(() => computeGroupStandings(matches), [matches]);

  // ---- Melhores terceiros (8 vagas na Copa 2026) ----
  const bestThirds = useMemo(() => computeBestThirds(groups), [groups]);
  // Só mostra quando já há terceiros que jogaram (senão é uma lista de zeros).
  const showThirds = bestThirds.some((t) => t.played > 0);

  // ---- Mata-mata por fase ----
  const knockout = useMemo(() => {
    return KNOCKOUT_STAGES
      .map(({ key, label }) => ({
        key,
        label,
        games: matches
          .filter((m) => m.stage === key)
          .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff)),
      }))
      .filter((s) => s.games.length > 0);
  }, [matches]);

  const hasGroups = groups.length > 0;
  const hasKnockout = knockout.length > 0;

  // Colunas da árvore (16 avos → final) e a disputa de 3º lugar, à parte.
  const treeRounds = useMemo(
    () => knockout.filter((s) => TREE_ORDER.includes(s.key)),
    [knockout]
  );
  const thirdPlace = useMemo(
    () => knockout.find((s) => s.key === 'THIRD_PLACE') ?? null,
    [knockout]
  );

  const bracketLayout = useMemo(() => {
    const roundByKey = new Map(treeRounds.map((round) => [round.key, round]));
    const makeSideRound = (key: string, side: 'left' | 'right'): MiniRound => {
      const round = roundByKey.get(key);
      const games = round?.games ?? [];
      const split = Math.ceil(games.length / 2);
      const label =
        key === 'SEMI_FINALS'
          ? side === 'left'
            ? 'Semi 1'
            : 'Semi 2'
          : STAGE_SHORT_LABEL[key] ?? round?.label ?? key;

      return {
        key,
        label,
        games: side === 'left' ? games.slice(0, split) : games.slice(split),
      };
    };

    const leftRounds = SIDE_ORDER.map((key) => makeSideRound(key, 'left'));
    const rightRounds = SIDE_ORDER.map((key) => makeSideRound(key, 'right')).reverse();
    const finalGame = roundByKey.get('FINAL')?.games[0];

    return {
      leftRounds,
      rightRounds,
      finalGame,
      connectorPaths: buildConnectorPaths(leftRounds, [...rightRounds].reverse(), finalGame),
    };
  }, [treeRounds]);

  const selectableMatches = useMemo(() => {
    const treeGames = treeRounds.flatMap((round) => round.games);
    const thirdGames = thirdPlace?.games ?? [];
    return [...treeGames, ...thirdGames];
  }, [treeRounds, thirdPlace]);

  const preferredSelectedId = useMemo(() => {
    const live = selectableMatches.find((m) => m.isLive);
    if (live) return live.id;
    const final = selectableMatches.find((m) => m.stage === 'FINAL');
    if (final) return final.id;
    const pending = selectableMatches.find((m) => m.status !== 'finished');
    return pending?.id ?? selectableMatches[0]?.id ?? null;
  }, [selectableMatches]);

  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectableMatches.length) {
      if (selectedMatchId) setSelectedMatchId(null);
      return;
    }

    const selectedStillExists = selectableMatches.some((m) => m.id === selectedMatchId);
    if (!selectedStillExists) setSelectedMatchId(preferredSelectedId);
  }, [preferredSelectedId, selectableMatches, selectedMatchId]);

  const selectedMatch = useMemo(
    () => selectableMatches.find((m) => m.id === selectedMatchId) ?? null,
    [selectableMatches, selectedMatchId]
  );

  return (
    <div className="brk-tab">
      <h1 className="brk-page-title">CHAVEAMENTO</h1>

      <div className="brk-toggle">
        <button
          className={`brk-toggle-btn ${view === 'grupos' ? 'active' : ''}`}
          onClick={() => setView('grupos')}
        >
          Grupos
        </button>
        <button
          className={`brk-toggle-btn ${view === 'mata' ? 'active' : ''}`}
          onClick={() => setView('mata')}
        >
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

          {/* MELHORES TERCEIROS — 8 vagas (Copa 2026) */}
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
          <div className="brk-knockout">
            <div className="brk-world-board">
              <svg className="brk-world-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                {bracketLayout.connectorPaths.map((path, index) => (
                  <path
                    key={`${path.side}-${index}`}
                    d={path.d}
                    className={`brk-world-line ${path.side}`}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </svg>

              <div className="brk-world-side brk-world-left">
                {bracketLayout.leftRounds.map((round) => (
                  <MiniRoundColumn
                    key={round.key}
                    round={round}
                    selectedMatchId={selectedMatchId}
                    onSelectMatch={setSelectedMatchId}
                  />
                ))}
              </div>

              <div className="brk-world-center">
                <img src="/imagens/trofeu.webp" alt="" className="brk-world-trophy" aria-hidden="true" />
                <div className="brk-world-final-label">Final</div>
                {bracketLayout.finalGame ? (
                  <CompactMatchCard
                    m={bracketLayout.finalGame}
                    focus
                    selected={selectedMatchId === bracketLayout.finalGame.id}
                    onSelect={setSelectedMatchId}
                  />
                ) : (
                  <div className="brk-mini-match focus empty">
                    <span>Final</span>
                  </div>
                )}
              </div>

              <div className="brk-world-side brk-world-right">
                {bracketLayout.rightRounds.map((round) => (
                  <MiniRoundColumn
                    key={round.key}
                    round={round}
                    selectedMatchId={selectedMatchId}
                    onSelectMatch={setSelectedMatchId}
                  />
                ))}
              </div>
            </div>

            {selectedMatch && <MatchDetail match={selectedMatch} />}

            {thirdPlace && (
              <div className="brk-third brk-third-compact">
                <div className="brk-third-head">{thirdPlace.label}</div>
                {thirdPlace.games.map((m) => (
                  <CompactMatchCard
                    key={m.id}
                    m={m}
                    focus
                    selected={selectedMatchId === m.id}
                    onSelect={setSelectedMatchId}
                  />
                ))}
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
}

export default BracketTab;
