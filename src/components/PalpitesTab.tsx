// ============================================================
// PalpitesTab — aba "Palpites": (1) os palpites especiais da Copa (campeão e
// até onde o Brasil vai, 5 pts cada, editáveis até 28/06) e (2) o histórico
// pessoal do usuário, agrupado por dia e paginado, com os pontos jogo a jogo.
// ============================================================
import React, { useMemo, useState } from 'react';
import type { Match, Bet, Participant, SpecialPrediction, BrazilStage } from '../types';
import { analyzeBet } from '../utils/rules';
import {
  computeChampion,
  computeBrazilStage,
  BRAZIL_STAGE_LABELS,
  BRAZIL_STAGE_OPTIONS,
  SPECIAL_LOCK_ISO,
  SPECIAL_POINTS,
} from '../utils/specials';
import { translateTeam, flagSrc, flagOf } from '../lib/teamMaps';

interface PalpitesTabProps {
  matches: Match[];
  bets: Bet[];
  participants: Participant[];
  specials: SpecialPrediction[]; // palpites especiais de todos
  currentUser: Participant;
  nowTs: number; // relógio do app (define se os especiais já travaram)
  onSave: (championTeam: string, brazilStage: BrazilStage) => Promise<void>;
}

export const PalpitesTab: React.FC<PalpitesTabProps> = ({
  matches,
  bets,
  participants,
  specials,
  currentUser,
  nowTs,
  onSave,
}) => {
  const locked = nowTs >= Date.parse(SPECIAL_LOCK_ISO);
  const myPrediction = specials.find((s) => s.participantId === currentUser.id);

  // Rascunhos dos selects: o que o usuário escolheu agora tem prioridade
  const [champDraft, setChampDraft] = useState('');
  const [stageDraft, setStageDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [historyPage, setHistoryPage] = useState(0);

  const championValue = champDraft || myPrediction?.championTeam || '';
  const stageValue = stageDraft || myPrediction?.brazilStage || '';

  // Lista de seleções da Copa (nomes em inglês do banco, exibidos em português)
  const teams = useMemo(() => {
    const names = new Set<string>();
    matches.forEach((m) => {
      if (m.homeTeamEn && m.homeTeamEn !== 'A definir') names.add(m.homeTeamEn);
      if (m.awayTeamEn && m.awayTeamEn !== 'A definir') names.add(m.awayTeamEn);
    });
    return Array.from(names).sort((a, b) => translateTeam(a).localeCompare(translateTeam(b)));
  }, [matches]);

  // Resultados reais (para marcar os +5 conquistados)
  const championOutcome = useMemo(() => computeChampion(matches), [matches]);
  const brazilOutcome = useMemo(() => computeBrazilStage(matches), [matches]);

  const handleSave = async () => {
    if (!championValue || !stageValue) return;
    setSaving(true);
    try {
      await onSave(championValue, stageValue as BrazilStage);
      setChampDraft('');
      setStageDraft('');
    } finally {
      setSaving(false);
    }
  };

  const canSave =
    !locked &&
    !saving &&
    championValue !== '' &&
    stageValue !== '' &&
    (championValue !== myPrediction?.championTeam || stageValue !== myPrediction?.brazilStage);

  // Histórico pessoal agrupado por dia, do mais recente ao mais antigo
  const historyDays = useMemo(() => {
    const started = matches
      .filter((m) => m.status === 'finished' || Date.parse(m.kickoff) <= nowTs)
      .sort((a, b) => Date.parse(b.kickoff) - Date.parse(a.kickoff));

    const days: { iso: string; label: string; matches: Match[]; points: number }[] = [];
    started.forEach((m) => {
      let day = days.find((d) => d.iso === m.isoDate);
      if (!day) {
        day = { iso: m.isoDate, label: m.date, matches: [], points: 0 };
        days.push(day);
      }
      day.matches.push(m);
      const bet = bets.find((b) => b.matchId === m.id && b.participantId === currentUser.id);
      day.points += analyzeBet(bet, m).points;
    });
    return days;
  }, [matches, bets, currentUser.id, nowTs]);

  // Paginação do histórico: 3 dias por página, do mais recente ao mais antigo
  const HISTORY_PAGE_SIZE = 3;
  const totalHistoryPages = Math.max(1, Math.ceil(historyDays.length / HISTORY_PAGE_SIZE));
  const currentHistoryPage = Math.min(historyPage, totalHistoryPages - 1);
  const pagedHistoryDays = historyDays.slice(
    currentHistoryPage * HISTORY_PAGE_SIZE,
    currentHistoryPage * HISTORY_PAGE_SIZE + HISTORY_PAGE_SIZE
  );

  return (
    <div className="standings-container-modern">

      {/* CARD DOS PALPITES ESPECIAIS */}
      <div className="pix-payment-card stretch">
        <div className="pix-card-title">
          <img src="/imagens/trofeu.webp" alt="Troféu" style={{ width: '28px', height: '28px', objectFit: 'contain', marginRight: '8px', verticalAlign: 'middle' }} />
          PALPITES DA COPA
        </div>
        <div className="palpites-hint">
          Valem <b>{SPECIAL_POINTS} pontos</b> cada ao serem confirmados.
          {!locked && ' Você pode editar até 28/06 (início do mata-mata).'}
          {locked && ' Palpites travados (mata-mata começou).'}
        </div>

        <label className="palpites-label">QUEM GANHA A COPA?</label>
        <select
          className="palpites-select"
          value={championValue}
          disabled={locked}
          onChange={(e) => setChampDraft(e.target.value)}
        >
          <option value="" disabled>Escolha a seleção campeã</option>
          {teams.map((t) => (
            <option key={t} value={t}>{translateTeam(t)}</option>
          ))}
        </select>

        <label className="palpites-label">ATÉ ONDE O BRASIL VAI?</label>
        <select
          className="palpites-select"
          value={stageValue}
          disabled={locked}
          onChange={(e) => setStageDraft(e.target.value)}
        >
          <option value="" disabled>Escolha o destino do Brasil</option>
          {BRAZIL_STAGE_OPTIONS.map((s) => (
            <option key={s} value={s}>{BRAZIL_STAGE_LABELS[s]}</option>
          ))}
        </select>

        {!locked && (
          <button
            type="button"
            className={`pix-copy-btn palpites-save-btn ${canSave ? '' : 'disabled'}`}
            disabled={!canSave}
            onClick={handleSave}
          >
            {saving ? 'SALVANDO...' : myPrediction ? 'ATUALIZAR PALPITES' : 'SALVAR PALPITES'}
          </button>
        )}

        {/* Palpites de todos os participantes */}
        <div className="palpites-others-list">
          {participants.map((p) => {
            const sp = specials.find((s) => s.participantId === p.id);
            const hitChampion = !!sp && !!championOutcome && sp.championTeam === championOutcome;
            const hitBrazil = !!sp && !!brazilOutcome && sp.brazilStage === brazilOutcome;
            return (
              <div key={p.id} className="palpites-other-row">
                <span className="palpites-other-name">{p.name}</span>
                {sp ? (
                  <span className="palpites-other-picks">
                    <img src="/imagens/trofeu.webp" alt="Troféu" style={{ width: '16px', height: '16px', objectFit: 'contain', marginRight: '4px', verticalAlign: 'middle' }} />
                    <img src={flagSrc(flagOf(sp.championTeam, ''), 40)} alt={sp.championTeam} style={{ width: '16px', height: '16px', borderRadius: '50%', objectFit: 'cover', marginRight: '4px', verticalAlign: 'middle' }} onError={(e) => { e.currentTarget.src = 'https://flagcdn.com/w40/un.png'; }} />
                    {translateTeam(sp.championTeam)}{hitChampion ? ' (+5)' : ''}
                    {' · '}
                    <img src={flagSrc('br', 40)} alt="Brasil" style={{ width: '16px', height: '16px', borderRadius: '50%', objectFit: 'cover', marginRight: '4px', verticalAlign: 'middle' }} />
                    {BRAZIL_STAGE_LABELS[sp.brazilStage]}{hitBrazil ? ' (+5)' : ''}
                  </span>
                ) : (
                  <span className="palpites-other-picks none">Sem palpite</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* CARD DO HISTÓRICO PESSOAL */}
      <div className="pix-payment-card stretch">
        <div className="pix-card-title">
          <img src="https://www.thiings.co/_next/image?url=https%3A%2F%2Flftz25oez4aqbxpq.public.blob.vercel-storage.com%2Fimage-gqcPFadwUlUpL8ajC5Ap9ZN7a6JCTu.png&w=320&q=75" alt="Histórico" style={{ width: '28px', height: '28px', objectFit: 'contain', marginRight: '8px', verticalAlign: 'middle' }} />
          MEU HISTÓRICO ({currentUser.name})
        </div>

        {historyDays.length === 0 ? (
          <div className="palpites-hint">Nenhum jogo disputado ainda.</div>
        ) : (
          <>
          <div className="history-list">
            {pagedHistoryDays.map((day) => (
              <div key={day.iso} className="history-day-group">
                <div className="history-day-header">
                  <span className="history-day-label">
                    <img src="https://www.thiings.co/_next/image?url=https%3A%2F%2Flftz25oez4aqbxpq.public.blob.vercel-storage.com%2Fimage-Sae9tyL6cjfCtWIsMdmFt0tn7Iu2tQ.png&w=320&q=75" alt="Data" style={{ width: '18px', height: '18px', objectFit: 'contain', marginRight: '4px', verticalAlign: 'middle' }} />
                    {day.label}
                  </span>
                  <span className="history-day-points">{day.points} pts no dia</span>
                </div>

                {day.matches.map((m) => {
                  const bet = bets.find((b) => b.matchId === m.id && b.participantId === currentUser.id);
                  const analysis = analyzeBet(bet, m);

                  let badgeClass = 'wrong';
                  let badgeText = '0 pts';
                  if (analysis.type === 'exact') { badgeClass = 'exact'; badgeText = '+3 pts'; }
                  else if (analysis.type === 'draw') { badgeClass = 'draw'; badgeText = '+2 pts'; }
                  else if (analysis.type === 'winner') { badgeClass = 'winner'; badgeText = '+1 pt'; }
                  else if (analysis.type === 'pending') { badgeClass = 'pending'; badgeText = 'Pendente'; }

                  const realScore = `${m.homeScore ?? '-'} x ${m.awayScore ?? '-'}`;

                  return (
                    <div key={m.id} className="history-row">
                      <div className="history-row-header">
                        <span className="history-date">{m.group} · {m.time}</span>
                        <div className={`inline-guess-badge-p16 ${badgeClass}`}>
                          {badgeText}
                        </div>
                      </div>

                      <div className="history-matchup">
                        <div className="history-team home">
                          <span className="history-team-name">{m.homeTeam}</span>
                          <img
                            src={flagSrc(m.homeFlag, 40)}
                            alt={m.homeTeam}
                            className="history-flag"
                            onError={(e) => { e.currentTarget.src = 'https://flagcdn.com/w40/un.png'; }}
                          />
                        </div>

                        <div className="history-score-badge">
                          {realScore}
                        </div>

                        <div className="history-team away">
                          <img
                            src={flagSrc(m.awayFlag, 40)}
                            alt={m.awayTeam}
                            className="history-flag"
                            onError={(e) => { e.currentTarget.src = 'https://flagcdn.com/w40/un.png'; }}
                          />
                          <span className="history-team-name">{m.awayTeam}</span>
                        </div>
                      </div>

                      <div className="history-bet-row">
                        <span className="history-bet-label">Seu palpite:</span>
                        <span className="history-bet-value">
                          {bet ? `${bet.homeScore} x ${bet.awayScore}` : 'Sem palpite'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {totalHistoryPages > 1 && (
            <div className="history-pagination">
              <button
                type="button"
                className="history-page-btn"
                disabled={currentHistoryPage === 0}
                onClick={() => setHistoryPage((p) => Math.max(0, p - 1))}
              >
                ← Mais recentes
              </button>
              <span className="history-page-info">
                Página {currentHistoryPage + 1} de {totalHistoryPages}
              </span>
              <button
                type="button"
                className="history-page-btn"
                disabled={currentHistoryPage >= totalHistoryPages - 1}
                onClick={() => setHistoryPage((p) => Math.min(totalHistoryPages - 1, p + 1))}
              >
                Dias anteriores →
              </button>
            </div>
          )}
          </>
        )}
      </div>
    </div>
  );
};

export default PalpitesTab;
