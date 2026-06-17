import React from 'react';
import type { Participant, Match, Bet, ParticipantStanding, SpecialPrediction } from '../types';
import {
  calculateFireCounts,
  calculatePeFrioCounts,
  calculateMvpCounts,
  calculateConquestTimeline
} from '../utils/rules';
import { User, Calendar, Award } from 'lucide-react';
import { translateTeam, flagSrc, flagOf } from '../lib/teamMaps';
import { BRAZIL_STAGE_LABELS } from '../utils/specials';
import Aurora from './Aurora';

interface ProfileTabProps {
  currentUser: Participant;
  participants: Participant[];
  matches: Match[];
  bets: Bet[];
  specials: SpecialPrediction[];
  standings: ParticipantStanding[];
}

const PE_FRIO_IMG = "https://www.thiings.co/_next/image?url=https%3A%2F%2Flftz25oez4aqbxpq.public.blob.vercel-storage.com%2Fimage-okSb6P6VxQwXTDfYgiOiheKJpixk2a.png&w=320&q=75";

export const ProfileTab: React.FC<ProfileTabProps> = ({
  currentUser,
  participants,
  matches,
  bets,
  specials,
  standings,
}) => {
  const selectedUserId = currentUser.id;
  const selectedUser = currentUser;
  const standing = standings.find((s) => s.participantId === selectedUserId);
  const rank = standings.findIndex((s) => s.participantId === selectedUserId) + 1;
  const userSpecial = specials.find((s) => s.participantId === selectedUserId);

  // Cálculos de Conquistas
  const fireCounts = calculateFireCounts(matches, bets, participants);
  const peFrioCounts = calculatePeFrioCounts(matches, bets, participants);
  const mvpCounts = calculateMvpCounts(matches, bets, participants);
  const timeline = calculateConquestTimeline(selectedUserId, matches, bets, participants);

  const userFire = fireCounts[selectedUserId] || { fires: 0, currentStreak: 0 };
  const userPeFrio = peFrioCounts[selectedUserId] || 0;
  const userMvp = mvpCounts[selectedUserId] || 0;
  const userProfeta = standing?.exactScoreCount || 0;

  const totalPoints = standing?.points || 0;
  const totalBets = standing?.totalBets || 0;
  const exacts = standing?.exactScoreCount || 0;
  const draws = standing?.correctDrawCount || 0;
  const winners = standing?.correctWinnerCount || 0;
  const wrongs = standing?.wrongCount || 0;

  // Lógica de avatar com fallback
  const getAvatarUrl = (pId: string) => {
    return `/imagens/ranking ${pId}.webp`;
  };

  return (
    <div className="profile-tab-container-p16">

      {/* CARD PRINCIPAL DE IDENTIFICAÇÃO DO PARTICIPANTE */}
      <div className="profile-header-card">
        <Aurora
          colorStops={["#009c3b", "#f5b300", "#15110E"]}
          blend={0.7}
          amplitude={0.8}
          speed={0.3}
        />
        <div className="profile-header-bg-glow"></div>
        <div className="profile-header-content">
          <div className="profile-header-avatar-wrap">
            <img
              src={getAvatarUrl(selectedUser.id)}
              alt={selectedUser.name}
              className="profile-header-avatar"
              onError={(e) => { e.currentTarget.src = selectedUser.avatarUrl; }}
            />
            {rank > 0 && <span className="profile-header-rank-badge">{rank}º</span>}
          </div>

          <div className="profile-header-text">
            <h2 className="profile-header-name">
              <User size={18} className="profile-name-icon" />
              <span className="profile-name-text">{selectedUser.name.toUpperCase()}</span>
            </h2>
            <div className="profile-header-stats-row">
              <span className="profile-header-stat-pts">
                <b>{totalPoints}</b> {totalPoints === 1 ? 'ponto' : 'pontos'}
              </span>
              <span className="profile-header-stat-divider">·</span>
              <span className="profile-header-stat-bets">
                <b>{totalBets}</b> {totalBets === 1 ? 'palpite' : 'palpites'}
              </span>
            </div>
          </div>
        </div>
        <div className="profile-stats-grid">
          <div className="profile-stat-box animate-scale">
            <span className="profile-stat-val val-exact">{exacts}</span>
            <span className="profile-stat-label">Exatos</span>
          </div>
          <div className="profile-stat-box animate-scale">
            <span className="profile-stat-val val-draw">{draws}</span>
            <span className="profile-stat-label">Empates</span>
          </div>
          <div className="profile-stat-box animate-scale">
            <span className="profile-stat-val val-winner">{winners}</span>
            <span className="profile-stat-label">Vencedor</span>
          </div>
          <div className="profile-stat-box animate-scale">
            <span className="profile-stat-val val-wrong">{wrongs}</span>
            <span className="profile-stat-label">Zerados</span>
          </div>
        </div>

        {/* PALPITES ESPECIAIS */}
        <div className="profile-specials-box">
          <h4 className="profile-specials-title">PALPITES ESPECIAIS</h4>
          <div className="profile-specials-grid">
            <div className="profile-special-item">
              <div className="profile-special-flag-wrap">
                {userSpecial ? (
                  <img
                    src={flagSrc(flagOf(userSpecial.championTeam, ''), 40)}
                    alt={userSpecial.championTeam}
                    className="profile-special-flag-img"
                    onError={(e) => { e.currentTarget.src = 'https://flagcdn.com/w40/un.png'; }}
                  />
                ) : (
                  <span className="profile-special-emoji">🏆</span>
                )}
              </div>
              <div className="profile-special-details">
                <span className="profile-special-label">Campeão previsto</span>
                <span className="profile-special-value">
                  {userSpecial ? translateTeam(userSpecial.championTeam) : 'Não definido'}
                </span>
              </div>
            </div>
            <div className="profile-special-item">
              <div className="profile-special-flag-wrap">
                <img
                  src={flagSrc('br', 40)}
                  alt="Brasil"
                  className="profile-special-flag-img"
                />
              </div>
              <div className="profile-special-details">
                <span className="profile-special-label">Brasil vai até</span>
                <span className="profile-special-value">
                  {userSpecial ? BRAZIL_STAGE_LABELS[userSpecial.brazilStage] : 'Não definido'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION TITLE: CONQUISTAS */}
      <div className="profile-section-header">
        <Award size={18} className="profile-section-icon" />
        <h3 className="profile-section-title">CONQUISTAS DO CAMPEONATO</h3>
      </div>

      {/* LISTA DE CONQUISTAS RETANGULARES (MAIS LIMPO E CONDICENTE) */}
      <div className="achievement-list-rect">

        {/* CONQUISTA: ON FIRE */}
        <div className="achievement-card-rect on-fire">
          <Aurora
            colorStops={["#ff4d1c", "#ff8c00", "#e11d48"]}
            blend={0.65}
            amplitude={1.0}
            speed={0.45}
          />
          <div className="achievement-rect-left">
            <span className="achievement-rect-emoji animate-pulse">🔥</span>
          </div>
          <div className="achievement-rect-middle">
            <span className="achievement-rect-title">ON FIRE</span>
            <span className="achievement-rect-desc">Pontuou em 5 jogos seguidos ou acertou 3 placares exatos em sequência.</span>
            {/* Progresso rumo ao próximo fogo pela regra dos 5 jogos pontuando */}
            <div className="onfire-progress">
              <div className="onfire-progress-track">
                <div
                  className="onfire-progress-fill"
                  style={{ width: `${(Math.min(userFire.currentStreak, 5) / 5) * 100}%` }}
                />
              </div>
              <span className="onfire-progress-label">{Math.min(userFire.currentStreak, 5)}/5</span>
            </div>
          </div>
          <div className="achievement-rect-right">
            <span className="achievement-rect-count">{userFire.fires}</span>
          </div>
        </div>

        {/* CONQUISTA: PROFETA */}
        <div className="achievement-card-rect profeta">
          <Aurora
            colorStops={["#c084fc", "#8a2be2", "#6b21a8"]}
            blend={0.65}
            amplitude={1.0}
            speed={0.45}
          />
          <div className="achievement-rect-left">
            <span className="achievement-rect-emoji">🔮</span>
          </div>
          <div className="achievement-rect-middle">
            <span className="achievement-rect-title">PROFETA</span>
            <span className="achievement-rect-desc">Cravou o placar exato.</span>
          </div>
          <div className="achievement-rect-right">
            <span className="achievement-rect-count">{userProfeta}</span>
          </div>
        </div>

        {/* CONQUISTA: PÉ FRIO */}
        <div className="achievement-card-rect pe-frio">
          <Aurora
            colorStops={["#94a3b8", "#64748b", "#334155"]}
            blend={0.65}
            amplitude={1.0}
            speed={0.45}
          />
          <div className="achievement-rect-left">
            <img
              src={PE_FRIO_IMG}
              alt="Pé Frio"
              className="achievement-rect-img"
            />
          </div>
          <div className="achievement-rect-middle">
            <span className="achievement-rect-title">PÉ FRIO</span>
            <span className="achievement-rect-desc">Foi o único a não pontuar em um jogo.</span>
          </div>
          <div className="achievement-rect-right">
            <span className="achievement-rect-count">{userPeFrio}</span>
          </div>
        </div>

        {/* CONQUISTA: MVP */}
        <div className="achievement-card-rect mvp">
          <Aurora
            colorStops={["#ffe066", "#f5b300", "#c58c00"]}
            blend={0.65}
            amplitude={1.0}
            speed={0.45}
          />
          <div className="achievement-rect-left">
            <img
              src="/imagens/coroa-mvp.png"
              alt="MVP"
              className="achievement-rect-img"
            />
          </div>
          <div className="achievement-rect-middle">
            <span className="achievement-rect-title">MVP DA RODADA</span>
            <span className="achievement-rect-desc">O que mais pontuou no dia.</span>
          </div>
          <div className="achievement-rect-right">
            <span className="achievement-rect-count">{userMvp}</span>
          </div>
        </div>

      </div>

      {/* SECTION TITLE: LINHA DO TEMPO DE CONQUISTAS */}
      <div className="profile-section-header">
        <Calendar size={18} className="profile-section-icon" />
        <h3 className="profile-section-title">LINHA DO TEMPO DE CONQUISTAS</h3>
      </div>

      {/* HISTÓRICO DE EVENTOS COM DESIGN IDÊNTICO À SEÇÃO PALPITES */}
      <div className="profile-timeline-list-p16" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {timeline.length > 0 ? (
          timeline.map((c, idx) => {
            const hasMatch = !!c.match;

            if (hasMatch && c.match) {
              const m = c.match;
              const bet = c.bet;
              const isProfeta = c.type === 'profeta';

              const badgeClass = isProfeta ? 'exact' : 'pe-frio-badge';
              const badgeText = isProfeta ? '🔮 PROFETA (+3 PTS)' : 'PÉ FRIO (0 PTS)';

              return (
                <div key={idx} className="history-row">
                  <div className="history-row-header">
                    <span className="history-date">{m.group} · {c.date}</span>
                    <div className={`inline-guess-badge-p16 ${badgeClass}`} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {!isProfeta && (
                        <img
                          src={PE_FRIO_IMG}
                          alt="Pé Frio"
                          style={{ width: '12px', height: '12px', objectFit: 'contain' }}
                        />
                      )}
                      <span>{badgeText}</span>
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
                      {m.homeScore} x {m.awayScore}
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

                  {bet && (
                    <div className="history-bet-row" style={{
                      background: isProfeta ? 'rgba(74, 222, 128, 0.04)' : 'rgba(148, 163, 184, 0.05)',
                      borderColor: isProfeta ? 'rgba(74, 222, 128, 0.12)' : 'rgba(148, 163, 184, 0.15)'
                    }}>
                      <span className="history-bet-label">Seu palpite:</span>
                      <span className="history-bet-value" style={{ color: isProfeta ? '#4ade80' : '#94a3b8' }}>
                        {bet.homeScore} x {bet.awayScore}
                      </span>
                    </div>
                  )}
                </div>
              );
            } else {
              // Conquistas de ON FIRE ou MVP (não associadas a um jogo específico)
              const isMvp = c.type === 'mvp';
              const badgeClass = isMvp ? 'draw' : 'winner';
              const badgeText = isMvp ? 'MVP DA RODADA' : 'ON FIRE!';

              return (
                <div key={idx} className="history-row">
                  <div className="history-row-header">
                    <span className="history-date">Rodada · {c.date}</span>
                    <div className={`inline-guess-badge-p16 ${badgeClass}`} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {isMvp ? (
                        <img
                          src="/imagens/coroa-mvp.png"
                          alt="MVP"
                          style={{ width: '12px', height: '12px', objectFit: 'contain' }}
                        />
                      ) : (
                        <span style={{ fontSize: '10px' }}>🔥</span>
                      )}
                      <span>{badgeText}</span>
                    </div>
                  </div>

                  <div style={{ padding: '0.4rem 0', display: 'flex', flexDirection: 'column', gap: '0.25rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#F2ECDD' }}>
                      {c.title}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.55)', lineHeight: 1.35 }}>
                      {c.description}
                    </div>
                  </div>
                </div>
              );
            }
          })
        ) : (
          <div className="profile-timeline-empty">
            Nenhuma conquista registrada ainda. Os palpites e resultados dos jogos criarão conquistas em tempo real!
          </div>
        )}
      </div>

    </div>
  );
};

export default ProfileTab;
