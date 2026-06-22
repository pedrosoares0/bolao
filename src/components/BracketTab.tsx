// ============================================================
// BracketTab — aba "Chaveamento". Mostra a fase de grupos (classificação +
// placares de cada grupo) e a chave do mata-mata (16 avos → final) com os
// placares e o time vencedor destacado. Puramente leitura: deriva tudo dos
// `matches` já carregados em App.tsx (não vai ao banco).
// ============================================================
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { Match } from '../types';
import { flagSrc } from '../lib/teamMaps';

interface BracketTabProps {
  matches: Match[];
}

// Linha da tabela de classificação de um grupo
interface GroupRow {
  en: string;       // nome em inglês (chave)
  name: string;     // nome em português (exibição)
  flag: string;     // código/URL da bandeira
  played: number;   // jogos
  won: number;
  drawn: number;
  lost: number;
  gf: number;       // gols pró
  ga: number;       // gols contra
  pts: number;
}

const TBD = 'A definir';
const isTbd = (s: string) => !s || s === TBD;

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

function BracketTab({ matches }: BracketTabProps) {
  const [view, setView] = useState<'grupos' | 'mata'>('grupos');
  // Fases do mata-mata expandidas (chave da fase -> aberto?)
  const [openStages, setOpenStages] = useState<Record<string, boolean>>({});
  const toggleStage = (key: string) =>
    setOpenStages((prev) => ({ ...prev, [key]: !prev[key] }));

  // ---- Classificação dos grupos ----
  const groups = useMemo(() => {
    const byGroup = new Map<string, Map<string, GroupRow>>();

    const ensureRow = (g: Map<string, GroupRow>, en: string, name: string, flag: string): GroupRow => {
      let row = g.get(en);
      if (!row) {
        row = { en, name, flag, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, pts: 0 };
        g.set(en, row);
      }
      return row;
    };

    matches
      .filter((m) => m.stage === 'GROUP_STAGE' && m.group.startsWith('Grupo'))
      .forEach((m) => {
        if (!byGroup.has(m.group)) byGroup.set(m.group, new Map());
        const g = byGroup.get(m.group)!;
        // Registra os dois times mesmo sem jogo disputado (aparecem com zeros)
        const home = ensureRow(g, m.homeTeamEn, m.homeTeam, m.homeFlag);
        const away = ensureRow(g, m.awayTeamEn, m.awayTeam, m.awayFlag);
        if (m.status !== 'finished' || m.homeScore === null || m.awayScore === null) return;

        home.played++; away.played++;
        home.gf += m.homeScore; home.ga += m.awayScore;
        away.gf += m.awayScore; away.ga += m.homeScore;
        if (m.homeScore > m.awayScore) {
          home.won++; home.pts += 3; away.lost++;
        } else if (m.awayScore > m.homeScore) {
          away.won++; away.pts += 3; home.lost++;
        } else {
          home.drawn++; away.drawn++; home.pts++; away.pts++;
        }
      });

    return Array.from(byGroup.entries())
      .sort((a, b) => a[0].localeCompare(b[0], 'pt'))
      .map(([label, rowsMap]) => {
        const rows = Array.from(rowsMap.values()).sort((x, y) => {
          if (y.pts !== x.pts) return y.pts - x.pts;
          const sgX = x.gf - x.ga, sgY = y.gf - y.ga;
          if (sgY !== sgX) return sgY - sgX;
          if (y.gf !== x.gf) return y.gf - x.gf;
          return x.name.localeCompare(y.name, 'pt');
        });
        return { label, rows };
      });
  }, [matches]);

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
        </div>
      )}

      {view === 'mata' && (
        <div className="brk-knockout">
          {!hasKnockout && (
            <div className="brk-empty">O mata-mata começa após a fase de grupos.</div>
          )}
          {knockout.map(({ key, label, games }) => {
            const isOpen = !!openStages[key];
            return (
            <div key={key} className="brk-stage">
              <button
                type="button"
                className={`brk-stage-title ${isOpen ? 'open' : ''}`}
                onClick={() => toggleStage(key)}
                aria-expanded={isOpen}
              >
                <span>{label}</span>
                <span className="brk-stage-count">{games.length}</span>
                {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>
              <div className={`brk-stage-games ${isOpen ? 'open' : ''}`}>
                <div className="brk-stage-games-inner">
                {games.map((m) => {
                  const win = winnerSide(m);
                  const finished = m.status === 'finished';
                  return (
                    <div key={m.id} className="brk-match">
                      <div className={`brk-match-team ${win === 'home' ? 'win' : win === 'away' ? 'lose' : ''}`}>
                        <img
                          loading="lazy" decoding="async"
                          src={flagSrc(m.homeFlag, 40)}
                          alt={m.homeTeam}
                          className="brk-flag"
                          onError={(e) => { e.currentTarget.src = 'https://flagcdn.com/w40/un.png'; }}
                        />
                        <span className="brk-team-name">{isTbd(m.homeTeamEn) ? TBD : m.homeTeam}</span>
                        <span className="brk-match-score">
                          {finished && m.homeScore !== null ? m.homeScore : '-'}
                        </span>
                      </div>
                      <div className={`brk-match-team ${win === 'away' ? 'win' : win === 'home' ? 'lose' : ''}`}>
                        <img
                          loading="lazy" decoding="async"
                          src={flagSrc(m.awayFlag, 40)}
                          alt={m.awayTeam}
                          className="brk-flag"
                          onError={(e) => { e.currentTarget.src = 'https://flagcdn.com/w40/un.png'; }}
                        />
                        <span className="brk-team-name">{isTbd(m.awayTeamEn) ? TBD : m.awayTeam}</span>
                        <span className="brk-match-score">
                          {finished && m.awayScore !== null ? m.awayScore : '-'}
                        </span>
                      </div>
                      <div className="brk-match-meta">
                        {finished ? 'Encerrado' : `${m.date} • ${m.time}`}
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
      )}
    </div>
  );
}

export default BracketTab;
