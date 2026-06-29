import React from 'react';
import type { Participant, Match, Bet, ParticipantStanding, SpecialPrediction } from '../types';
import {
  calculateFireCounts,
  calculatePeFrioCounts,
  calculateMvpCounts,
  calculateConquestTimeline
} from '../utils/rules';
import { User, Calendar, Award, ChevronDown, ChevronUp } from 'lucide-react';
import { translateTeam, flagSrc, flagOf } from '../lib/teamMaps';
import { BRAZIL_STAGE_LABELS } from '../utils/specials';
import Aurora from './Aurora';
import { useState } from 'react';
import html2canvas from 'html2canvas';

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
  const [selectedProfileId, setSelectedProfileId] = useState<string>(currentUser.id);
  const [compareProfileId, setCompareProfileId] = useState<string | null>(null);
  const [timelineExpanded, setTimelineExpanded] = useState(false);

  const selectedUserId = selectedProfileId;
  const selectedUser = participants.find((p) => p.id === selectedProfileId) || currentUser;
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

  // Cálculos para a comparação (sempre comparando o usuário logado com o selecionado)
  const myStanding = standings.find((s) => s.participantId === currentUser.id);
  const myRank = standings.findIndex((s) => s.participantId === currentUser.id) + 1;
  const mySpecial = specials.find((s) => s.participantId === currentUser.id);
  const myPoints = myStanding?.points || 0;
  const myExacts = myStanding?.exactScoreCount || 0;
  const myDraws = myStanding?.correctDrawCount || 0;
  const myWinners = myStanding?.correctWinnerCount || 0;
  const myWrongs = myStanding?.wrongCount || 0;

  // Conquistas do usuário logado para comparação
  const myFires = fireCounts[currentUser.id]?.fires || 0;
  const myPeFrio = peFrioCounts[currentUser.id] || 0;
  const myMvp = mvpCounts[currentUser.id] || 0;

  const comparisonOptions = participants.filter((p) => p.id !== currentUser.id);
  const comparedUser = compareProfileId ? participants.find((p) => p.id === compareProfileId) : null;
  const comparedStanding = compareProfileId ? standings.find((s) => s.participantId === compareProfileId) : null;
  const comparedRank = compareProfileId ? standings.findIndex((s) => s.participantId === compareProfileId) + 1 : 0;
  const comparedSpecial = compareProfileId ? specials.find((s) => s.participantId === compareProfileId) : null;
  const comparedPoints = comparedStanding?.points || 0;
  const comparedExacts = comparedStanding?.exactScoreCount || 0;
  const comparedDraws = comparedStanding?.correctDrawCount || 0;
  const comparedWinners = comparedStanding?.correctWinnerCount || 0;
  const comparedWrongs = comparedStanding?.wrongCount || 0;
  const comparedFires = compareProfileId ? (fireCounts[compareProfileId]?.fires || 0) : 0;
  const comparedPeFrio = compareProfileId ? (peFrioCounts[compareProfileId] || 0) : 0;
  const comparedMvp = compareProfileId ? (mvpCounts[compareProfileId] || 0) : 0;

  // Lógica de avatar com fallback
  const getAvatarUrl = (pId: string) => {
    return `/imagens/ranking ${pId}.webp`;
  };

  const handleShare = async () => {
    const element = document.getElementById('compare-card-to-share');
    if (!element) return;

    try {
      // Esconder botão de compartilhar temporariamente para a foto
      const shareBtn = element.querySelector('.compare-share-btn-container') as HTMLElement;
      if (shareBtn) shareBtn.style.visibility = 'hidden';

      const canvas = await html2canvas(element, {
        backgroundColor: '#15110E',
        scale: 2.5,
        useCORS: true,
        logging: false
      });

      if (shareBtn) shareBtn.style.visibility = 'visible';

      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], `comparacao-${currentUser.name}-vs-${comparedUser?.name}.png`, { type: 'image/png' });

        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: `Comparação: ${currentUser.name} vs ${comparedUser?.name}`,
            text: `Olha essa comparação do nosso Bolão! 🏆`
          });
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `comparacao-${currentUser.name}-vs-${comparedUser?.name}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          alert('Imagem salva no seu dispositivo! Agora você pode compartilhar no WhatsApp. 😉');
        }
      }, 'image/png');
    } catch (err) {
      console.error('Error sharing:', err);
      alert('Não foi possível gerar a imagem de compartilhamento.');
    }
  };

  return (
    <div className="profile-tab-container-p16">

      {selectedProfileId !== currentUser.id && (
        <div className="profile-viewing-banner-p16">
          <span className="profile-viewing-text-p16">
            Visualizando o perfil de {selectedUser.name}
          </span>
          <button
            type="button"
            className="profile-viewing-btn-p16"
            onClick={() => setSelectedProfileId(currentUser.id)}
          >
            Voltar para o meu perfil
          </button>
        </div>
      )}

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
            <img loading="lazy" decoding="async"
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
            <span className="profile-stat-label">Não Pontuado</span>
          </div>
        </div>

        {/* PALPITES ESPECIAIS */}
        <div className="profile-specials-box">
          <h4 className="profile-specials-title">PALPITES ESPECIAIS</h4>
          <div className="profile-specials-grid">
            <div className="profile-special-item">
              <div className="profile-special-flag-wrap">
                {userSpecial ? (
                  <img loading="lazy" decoding="async"
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
                <img loading="lazy" decoding="async"
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
        <h3 className="profile-section-title">CONQUISTAS</h3>
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
          <div className="card-particles">
            <div className="particle p1"></div>
            <div className="particle p2"></div>
            <div className="particle p3"></div>
            <div className="particle p4"></div>
            <div className="particle p5"></div>
          </div>
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
                {Math.min(userFire.currentStreak, 5) < 5 && (
                  <div className="onfire-progress-milestone-dot" />
                )}
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
          <div className="card-particles">
            <div className="particle p1"></div>
            <div className="particle p2"></div>
            <div className="particle p3"></div>
            <div className="particle p4"></div>
            <div className="particle p5"></div>
          </div>
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
            <img loading="lazy" decoding="async"
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
            <img loading="lazy" decoding="async"
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

      {/* SEÇÃO: COMPARAR PERFIS */}
      <div className="profile-section-header">
        <Award size={18} className="profile-section-icon" />
        <h3 className="profile-section-title">COMPARAR PERFIS</h3>
      </div>

      <div className="compare-card-dark" id="compare-card-to-share">
        <div className="compare-picker-row">
          <div className="compare-picker-user">
            <img
              loading="lazy" decoding="async"
              src={getAvatarUrl(currentUser.id)}
              alt={currentUser.name}
              className="compare-picker-avatar"
              onError={(e) => { e.currentTarget.src = currentUser.avatarUrl; }}
            />
            <span className="compare-picker-name">{currentUser.name}</span>
          </div>

          <span 
            className="compare-picker-x" 
            style={{ cursor: 'pointer' }} 
            onClick={() => setCompareProfileId(null)}
            title="Limpar Comparação"
          >✕</span>

          <div className="compare-picker-select-wrap">
            <select
              className="compare-picker-select"
              value={compareProfileId || ''}
              onChange={(e) => setCompareProfileId(e.target.value || null)}
            >
              <option value="">Selecionar...</option>
              {comparisonOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <span className="compare-picker-caret">▾</span>
          </div>
        </div>

        {comparedUser && comparedStanding && (() => {
          const overallWinner = myPoints > comparedPoints ? 'home' : comparedPoints > myPoints ? 'away' : 'draw';

          return (
            <div className="compare-body-dark">
              <div className="compare-vs-strip">
                <div className={`compare-vs-side ${overallWinner === 'home' ? 'overall-winner' : ''}`}>
                  <div className="avatar-container-with-sparks">
                    <img loading="lazy" decoding="async"
                      src={getAvatarUrl(currentUser.id)}
                      alt={currentUser.name}
                      className="compare-vs-avatar"
                      onError={(e) => { e.currentTarget.src = currentUser.avatarUrl; }}
                    />
                    {overallWinner === 'home' && (
                      <div className="card-particles winner-particles">
                        <div className="particle p1"></div>
                        <div className="particle p2"></div>
                        <div className="particle p3"></div>
                        <div className="particle p4"></div>
                        <div className="particle p5"></div>
                      </div>
                    )}
                  </div>
                  <span className="compare-vs-name">Você</span>
                </div>
                <span className="compare-vs-x">VS</span>
                <div className={`compare-vs-side ${overallWinner === 'away' ? 'overall-winner' : ''}`}>
                  <div className="avatar-container-with-sparks">
                    <img loading="lazy" decoding="async"
                      src={getAvatarUrl(comparedUser.id)}
                      alt={comparedUser.name}
                      className="compare-vs-avatar"
                      onError={(e) => { e.currentTarget.src = comparedUser.avatarUrl; }}
                    />
                    {overallWinner === 'away' && (
                      <div className="card-particles winner-particles">
                        <div className="particle p1"></div>
                        <div className="particle p2"></div>
                        <div className="particle p3"></div>
                        <div className="particle p4"></div>
                        <div className="particle p5"></div>
                      </div>
                    )}
                  </div>
                  <span className="compare-vs-name">{comparedUser.name}</span>
                </div>
              </div>

            <div className="compare-stats-dark">
              {[
                { label: 'Pontos', a: myPoints, b: comparedPoints, higher: true },
                { label: 'Posição', a: myRank, b: comparedRank, higher: false },
                { label: 'Placares Exatos', a: myExacts, b: comparedExacts, higher: true },
                { label: 'Empates', a: myDraws, b: comparedDraws, higher: true },
                { label: 'Vencedor', a: myWinners, b: comparedWinners, higher: true },
                { label: 'Não Pontuado', a: myWrongs, b: comparedWrongs, higher: false, isBad: true },
              ].map(({ label, a, b, higher, isBad }) => {
                let aClass = '';
                let bClass = '';
                if (isBad) {
                  if (a > b) aClass = 'bad-highlight';
                  if (b > a) bClass = 'bad-highlight';
                } else {
                  const aWins = higher ? a > b : a < b;
                  const bWins = higher ? b > a : b < a;
                  aClass = aWins ? 'win' : bWins ? 'lose' : '';
                  bClass = bWins ? 'win' : aWins ? 'lose' : '';
                }
                return (
                  <div key={label} className="compare-stat-row-dark">
                    <span className={`compare-stat-val ${aClass}`}>
                      {label === 'Posição' ? `${a}º` : a}
                    </span>
                    <span className="compare-stat-label">{label}</span>
                    <span className={`compare-stat-val ${bClass}`}>
                      {label === 'Posição' ? `${b}º` : b}
                    </span>
                  </div>
                );
              })}

              {/* Conquistas */}
              {[
                { label: 'On Fire', icon: '🔥', a: myFires, b: comparedFires, higher: true },
                { label: 'Profeta', icon: '🔮', a: myExacts, b: comparedExacts, higher: true },
                { label: 'Pé Frio', icon: 'pefrio', a: myPeFrio, b: comparedPeFrio, higher: false, isBad: true },
                { label: 'MVP', icon: 'mvp', a: myMvp, b: comparedMvp, higher: true },
              ].map(({ label, icon, a, b, higher, isBad }) => {
                let aClass = '';
                let bClass = '';
                if (isBad) {
                  // Pé Frio: quem tiver MAIS é destacado em vermelho
                  if (a > b) aClass = 'bad-highlight';
                  if (b > a) bClass = 'bad-highlight';
                } else {
                  const aWins = higher ? a > b : a < b;
                  const bWins = higher ? b > a : b < a;
                  aClass = aWins ? 'win' : bWins ? 'lose' : '';
                  bClass = bWins ? 'win' : aWins ? 'lose' : '';
                }
                return (
                  <div key={label} className="compare-stat-row-dark conquest">
                    <span className={`compare-stat-val ${aClass}`}>{a}</span>
                    <span className="compare-stat-label conquest-label">
                      {icon === 'pefrio' ? (
                        <img loading="lazy" src={PE_FRIO_IMG} alt="Pé Frio" className="compare-conquest-icon" />
                      ) : icon === 'mvp' ? (
                        <img loading="lazy" src="/imagens/coroa-mvp.png" alt="MVP" className="compare-conquest-icon" />
                      ) : (
                        <span className="compare-conquest-emoji">{icon}</span>
                      )}
                      {label}
                    </span>
                    <span className={`compare-stat-val ${bClass}`}>{b}</span>
                  </div>
                );
              })}

              <div className="compare-stat-row-dark">
                <span className="compare-stat-special">
                  {mySpecial ? (
                    <>
                      <img loading="lazy" src={flagSrc(flagOf(mySpecial.championTeam, ''), 20)} alt="" className="compare-mini-flag" onError={(e) => { e.currentTarget.src = 'https://flagcdn.com/w20/un.png'; }} />
                      {translateTeam(mySpecial.championTeam)}
                    </>
                  ) : '—'}
                </span>
                <span className="compare-stat-label">Campeão</span>
                <span className="compare-stat-special">
                  {comparedSpecial ? (
                    <>
                      <img loading="lazy" src={flagSrc(flagOf(comparedSpecial.championTeam, ''), 20)} alt="" className="compare-mini-flag" onError={(e) => { e.currentTarget.src = 'https://flagcdn.com/w20/un.png'; }} />
                      {translateTeam(comparedSpecial.championTeam)}
                    </>
                  ) : '—'}
                </span>
              </div>

              <div className="compare-stat-row-dark">
                <span className="compare-stat-special">
                  {mySpecial ? BRAZIL_STAGE_LABELS[mySpecial.brazilStage] : '—'}
                </span>
                <span className="compare-stat-label">Brasil vai até</span>
                <span className="compare-stat-special">
                  {comparedSpecial ? BRAZIL_STAGE_LABELS[comparedSpecial.brazilStage] : '—'}
                </span>
              </div>
            </div>

            <div className="compare-btns-dark compare-share-btn-container">
              <button 
                type="button" 
                className="compare-btn-dark primary"
                style={{ width: '100%' }}
                onClick={handleShare}
              >
                Compartilhar Comparação 📲
              </button>
            </div>
          </div>
        );
      })()}
    </div>

      {/* SECTION TITLE: LINHA DO TEMPO DE CONQUISTAS */}
      <div 
        className="profile-section-header"
        onClick={() => setTimelineExpanded(!timelineExpanded)}
        style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', userSelect: 'none' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Calendar size={18} className="profile-section-icon" />
          <h3 className="profile-section-title">LINHA DO TEMPO DE CONQUISTAS</h3>
        </div>
        {timelineExpanded ? <ChevronUp size={16} style={{ color: '#8b8075' }} /> : <ChevronDown size={16} style={{ color: '#8b8075' }} />}
      </div>

      {/* HISTÓRICO DE EVENTOS */}
      {timelineExpanded && (
        <div className="profile-timeline-list-p16" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {timeline.length > 0 ? (
            timeline.map((c, idx) => {
              const hasMatch = !!c.match;

              if (hasMatch && c.match) {
                const m = c.match;
                const bet = c.bet;
                const isProfeta = c.type === 'profeta';
                const badgeClass = isProfeta ? 'profeta-badge' : 'pe-frio-badge';
                const badgeText = isProfeta ? '🔮 PROFETA' : 'PÉ FRIO';

                return (
                  <div key={idx} className="history-row">
                    <div className="history-row-header">
                      <span className="history-date">{m.group} · {c.date}</span>
                      <div className={`inline-guess-badge-p16 ${badgeClass}`} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {!isProfeta && (
                          <img loading="lazy" decoding="async" src={PE_FRIO_IMG} alt="Pé Frio"
                            style={{ width: '12px', height: '12px', objectFit: 'contain' }} />
                        )}
                        <span>{badgeText}</span>
                      </div>
                    </div>
                    <div className="history-matchup">
                      <div className="history-team home">
                        <span className="history-team-name">{m.homeTeam}</span>
                        <img loading="lazy" decoding="async" src={flagSrc(m.homeFlag, 40)} alt={m.homeTeam}
                          className="history-flag" onError={(e) => { e.currentTarget.src = 'https://flagcdn.com/w40/un.png'; }} />
                      </div>
                      <div className="history-score-badge">{m.homeScore} x {m.awayScore}</div>
                      <div className="history-team away">
                        <img loading="lazy" decoding="async" src={flagSrc(m.awayFlag, 40)} alt={m.awayTeam}
                          className="history-flag" onError={(e) => { e.currentTarget.src = 'https://flagcdn.com/w40/un.png'; }} />
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
              } else if (c.type === 'mvp') {
                return (
                  <div key={idx} className="history-row">
                    <div className="history-row-header">
                      <span className="history-date">Rodada · {c.date}</span>
                      <div className="inline-guess-badge-p16 mvp-badge" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <img loading="lazy" decoding="async" src="/imagens/coroa-mvp.png" alt="MVP"
                          style={{ width: '12px', height: '12px', objectFit: 'contain' }} />
                        <span>MVP DA RODADA</span>
                      </div>
                    </div>
                    <div className="mvp-timeline-body">
                      <h4 className="mvp-timeline-title">🏆 MELHOR DESEMPENHO DO DIA</h4>
                      <div className="mvp-timeline-stats">
                        <div className="mvp-timeline-stat-box">
                          <span className="stat-value">{c.points ?? 0}</span>
                          <span className="stat-label">Pontos</span>
                        </div>
                        <div className="mvp-timeline-stat-box">
                          <span className="stat-value">{c.exacts ?? 0}</span>
                          <span className="stat-label">{c.exacts === 1 ? 'Placar Exato' : 'Placares Exatos'}</span>
                        </div>
                      </div>
                      <div className="mvp-timeline-desc">
                        Você foi o participante que mais pontuou nesta rodada!
                      </div>
                    </div>
                  </div>
                );
              } else {
                return (
                  <div key={idx} className="history-row">
                    <div className="history-row-header">
                      <span className="history-date">Rodada · {c.date}</span>
                      <div className="inline-guess-badge-p16 onfire-badge" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '10px' }}>🔥</span>
                        <span>ON FIRE!</span>
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
      )}

    </div>
  );
};

export default ProfileTab;
