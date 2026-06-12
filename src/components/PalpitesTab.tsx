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
import { translateTeam } from '../lib/teamMaps';

interface PalpitesTabProps {
  matches: Match[];
  bets: Bet[];
  participants: Participant[];
  specials: SpecialPrediction[];
  currentUser: Participant;
  nowTs: number;
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

  return (
    <div className="standings-container-modern">

      {/* CARD DOS PALPITES ESPECIAIS */}
      <div className="pix-payment-card stretch">
        <div className="pix-card-title">👑 PALPITES DA COPA</div>
        <div className="palpites-hint">
          Valem <b>{SPECIAL_POINTS} pontos</b> cada ao serem confirmados. Não pagam taxa — só a aposta diária.
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
                    🏆 {translateTeam(sp.championTeam)}{hitChampion ? ' (+5)' : ''}
                    {' · '}
                    🇧🇷 {BRAZIL_STAGE_LABELS[sp.brazilStage]}{hitBrazil ? ' (+5)' : ''}
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
        <div className="pix-card-title">📜 MEU HISTÓRICO ({currentUser.name})</div>

        {historyDays.length === 0 ? (
          <div className="palpites-hint">Nenhum jogo disputado ainda.</div>
        ) : (
          <div className="history-list">
            {historyDays.map((day) => (
              <div key={day.iso} className="history-day-group">
                <div className="history-day-header">
                  <span className="history-day-label">📅 {day.label}</span>
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
                      <div className="history-info">
                        <span className="history-date">{m.group} · {m.time}</span>
                        <span className="history-teams">{m.homeTeam} {realScore} {m.awayTeam}</span>
                        <span className="history-bet">
                          Seu palpite: {bet ? `${bet.homeScore} x ${bet.awayScore}` : 'Sem palpite'}
                        </span>
                      </div>
                      <div className={`inline-guess-badge-p16 ${badgeClass}`}>
                        {badgeText}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PalpitesTab;
