import React from 'react';
import type { ParticipantStanding, Match, Bet } from '../types';
import { analyzeBet } from '../utils/rules';
import LightRays from './LightRays';

interface StandingsTableProps {
  standings: ParticipantStanding[];
  matches: Match[];
  bets: Bet[];
}

const Slideshow: React.FC = () => {
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [dragX, setDragX] = React.useState(0);
  const [isDragging, setIsDragging] = React.useState(false);
  const startXRef = React.useRef(0);

  const participantSlides = [
    { id: 'pedro', img: '/imagens/pedro-slide.webp', name: 'Pedro' },
    { id: 'neto', img: '/imagens/neto-slide.webp', name: 'Neto' },
    { id: 'rodrigo', img: '/imagens/rodrigo-slide.webp', name: 'Rodrigo' },
    { id: 'alex', img: '/imagens/alex-slide.webp', name: 'Alex' },
  ];

  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    startXRef.current = clientX;
    setIsDragging(true);
  };

  const handleDragMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const deltaX = clientX - startXRef.current;
    setDragX(deltaX);
  };

  const handleDragEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    
    const threshold = 60;
    if (dragX > threshold) {
      // Swiped right -> go to previous card
      setActiveIndex((prev) => (prev - 1 + participantSlides.length) % participantSlides.length);
    } else if (dragX < -threshold) {
      // Swiped left -> go to next card
      setActiveIndex((prev) => (prev + 1) % participantSlides.length);
    } else {
      // Small drag is considered a click/tap -> go to next card
      setActiveIndex((prev) => (prev + 1) % participantSlides.length);
    }
    setDragX(0);
  };

  return (
    <div className="participants-section">
      <div className="participants-header">
        <h3 className="participants-title">Participantes</h3>
      </div>

      <div className="participants-list-wrapper-static">
        <div className="participants-stacked-container">
          {participantSlides.map((slide, index) => {
            const len = participantSlides.length;
            const diff = (index - activeIndex + len) % len;
            
            // Styles based on stack depth (diff)
            let transform = '';
            let zIndex = 1;
            let opacity = 0;
            let pointerEvents: 'auto' | 'none' = 'none';

            if (diff === 0) {
              // Front active card
              transform = `translateX(${dragX}px) rotate(${dragX * 0.04}deg) scale(1)`;
              zIndex = 10;
              opacity = 1;
              pointerEvents = 'auto';
            } else if (diff === 1) {
              // Behind to the right
              transform = 'translateX(28px) translateY(-6px) rotate(4deg) scale(0.92)';
              zIndex = 9;
              opacity = 0.9;
            } else if (diff === 2) {
              // Behind to the left
              transform = 'translateX(-26px) translateY(-12px) rotate(-6deg) scale(0.86)';
              zIndex = 8;
              opacity = 0.75;
            } else if (diff === 3) {
              // Bottom-most card
              transform = 'translateX(4px) translateY(-16px) rotate(2deg) scale(0.80)';
              zIndex = 7;
              opacity = 0.55;
            }

            const transitionStyle = isDragging && diff === 0
              ? 'none'
              : 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.2), opacity 0.4s ease';

            return (
              <div
                key={slide.id}
                className="participant-stacked-card"
                style={{
                  transform,
                  zIndex,
                  opacity,
                  transition: transitionStyle,
                  pointerEvents,
                  cursor: isDragging ? 'grabbing' : 'grab',
                }}
                onMouseDown={handleDragStart}
                onMouseMove={handleDragMove}
                onMouseUp={handleDragEnd}
                onMouseLeave={handleDragEnd}
                onTouchStart={handleDragStart}
                onTouchMove={handleDragMove}
                onTouchEnd={handleDragEnd}
              >
                <div className="participant-card-image-wrapper">
                  <img 
                    src={slide.img} 
                    alt={slide.name} 
                    className="participant-stacked-img" 
                    draggable="false"
                  />
                  <div className="participant-card-label-overlay">
                    <span className="participant-card-name">{slide.name}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="swiper-dots-container">
          {participantSlides.map((_, index) => (
            <div
              key={index}
              className={`swiper-dot ${index === activeIndex ? 'active' : ''}`}
              onClick={() => setActiveIndex(index)}
            ></div>
          ))}
        </div>
      </div>
    </div>
  );
};

export const StandingsTable: React.FC<StandingsTableProps> = ({ standings, matches, bets }) => {
  const [imageErrors, setImageErrors] = React.useState<Record<string, boolean>>({});
  const [onFireImageErrors, setOnFireImageErrors] = React.useState<Record<string, boolean>>({});

  // Helper para obter a imagem de ranking específica do participante
  const getRankingAvatar = (participantId: string) => {
    return `/imagens/ranking ${participantId}.webp`;
  };

  // Helper para obter a imagem do pódio (toma o card todo)
  const getPodiumImage = (participantId: string) => {
    return `/imagens/${participantId}-1ou2.webp`;
  };

  // Encontra participantes que pontuaram nos últimos 5 jogos em que palpitaram
  const getOnFireInfo = () => {
    if (!matches || !bets) return [];

    // 1. Filtrar jogos finalizados e ordenar cronologicamente por kickoff
    const finishedMatches = [...matches]
      .filter(m => m.status === 'finished' && m.homeScore !== null && m.awayScore !== null)
      .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));

    return standings
      .map((standing) => {
        const participantBets = bets.filter(b => b.participantId === standing.participantId);

        // Filtrar apenas os jogos finalizados em que este participante de fato apostou
        const finishedMatchesWithBets = finishedMatches.filter(match =>
          participantBets.some(b => b.matchId === match.id)
        );

        // Precisamos de pelo menos 5 jogos apostados para ter streak
        const lastFive = finishedMatchesWithBets.slice(-5);
        if (lastFive.length < 5) return null;

        // Verifica se pontuou em cada um desses 5 jogos (points > 0)
        const scoredAll = lastFive.every(match => {
          const bet = participantBets.find(b => b.matchId === match.id);
          const analysis = analyzeBet(bet, match);
          return analysis.points > 0;
        });

        if (!scoredAll) return null;
        return { standing, lastFive };
      })
      .filter((x): x is { standing: ParticipantStanding; lastFive: Match[] } => x !== null);
  };

  const onFirePlayers = getOnFireInfo();

  // Conta quantos "onfires" (medalhas de fogo) cada participante já conquistou.
  // Regra: a cada 5 jogos consecutivos pontuando (dentre os jogos em que apostou),
  // ganha +1 fogo PERMANENTE. Errar um jogo zera apenas a contagem rumo ao próximo
  // grupo de 5 — os fogos já conquistados nunca são removidos.
  const getFireCounts = (): Record<string, number> => {
    const counts: Record<string, number> = {};
    if (!matches || !bets) return counts;

    const finishedMatches = [...matches]
      .filter(m => m.status === 'finished' && m.homeScore !== null && m.awayScore !== null)
      .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));

    standings.forEach((standing) => {
      const participantBets = bets.filter(b => b.participantId === standing.participantId);
      let fires = 0;
      let streak = 0;
      finishedMatches.forEach((match) => {
        const bet = participantBets.find(b => b.matchId === match.id);
        if (!bet) return; // só conta jogos em que o participante apostou
        const analysis = analyzeBet(bet, match);
        if (analysis.points > 0) {
          streak++;
          if (streak === 5) {
            fires++;
            streak = 0;
          }
        } else {
          streak = 0;
        }
      });
      counts[standing.participantId] = fires;
    });

    return counts;
  };

  const fireCounts = getFireCounts();

  // Renderiza as medalhas de fogo ao lado do nome no ranking.
  const renderFireMedals = (participantId: string) => {
    const count = fireCounts[participantId] || 0;
    if (count <= 0) return null;
    return (
      <span
        className="fire-medal-badge"
        title={`${count} On Fire — ${count * 5} jogos pontuando em sequência`}
      >
        <span className="fire-medal-flame">🔥</span>
        {count > 1 && <span className="fire-medal-count">{count}</span>}
      </span>
    );
  };

  const firstPlace = standings[0];
  const secondPlace = standings[1];
  const remainingStandings = standings.slice(2);

  return (
    <div className="standings-container-modern">
      {/* RANKING CONTAINER COM LUZ DOURADA E FUNDO ESCURO */}
      <div className="ranking-podium-section">

        {/* PODIUM CARDS (1º e 2º lugares) */}
        <div className="podium-cards-container">

          {/* SEGUNDO LUGAR (Esquerda, menor) */}
          {secondPlace && (
            <div className={`podium-card second-place-card ${imageErrors[secondPlace.participantId] ? 'has-error' : ''}`}>
              {!imageErrors[secondPlace.participantId] ? (
                <>
                  <img
                    src={getPodiumImage(secondPlace.participantId)}
                    alt={secondPlace.name}
                    className="podium-card-img-bg"
                    onError={() => {
                      setImageErrors((prev) => ({ ...prev, [secondPlace.participantId]: true }));
                    }}
                  />
                  <div className="podium-card-overlay"></div>
                  <div className="podium-bg-number">2</div>
                  <div className="podium-medal-wrapper">
                    <img src="/imagens/medalha-segundo.webp" alt="Medalha 2º" className="podium-medal-img" />
                    <div className="medal-shine-overlay"></div>
                  </div>
                  <div className="podium-player-info-row">
                    <span className="podium-player-name">{secondPlace.name}</span>
                    {renderFireMedals(secondPlace.participantId)}
                    <div className="podium-player-pts glow-silver-text-anim">
                      <span className="pts-number">{secondPlace.points}</span>
                      <span className="pts-label">Pts</span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="podium-bg-number">2</div>
                  <div className="podium-medal-wrapper">
                    <img src="/imagens/medalha-segundo.webp" alt="Medalha 2º" className="podium-medal-img" />
                    <div className="medal-shine-overlay"></div>
                  </div>
                  <div className="podium-fallback-avatar-container">
                    <img
                      src={getRankingAvatar(secondPlace.participantId)}
                      alt={secondPlace.name}
                      className="podium-fallback-avatar"
                      onError={(e) => {
                        e.currentTarget.src = secondPlace.avatarUrl;
                      }}
                    />
                  </div>
                  <div className="podium-player-info-row">
                    <span className="podium-player-name">{secondPlace.name}</span>
                    {renderFireMedals(secondPlace.participantId)}
                    <div className="podium-player-pts glow-silver-text-anim">
                      <span className="pts-number">{secondPlace.points}</span>
                      <span className="pts-label">Pts</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* PRIMEIRO LUGAR (Direita, maior/destacado) */}
          {firstPlace && (
            <div className={`podium-card first-place-card ${imageErrors[firstPlace.participantId] ? 'has-error' : ''}`}>
              {!imageErrors[firstPlace.participantId] ? (
                <>
                  <img
                    src={getPodiumImage(firstPlace.participantId)}
                    alt={firstPlace.name}
                    className="podium-card-img-bg"
                    onError={() => {
                      setImageErrors((prev) => ({ ...prev, [firstPlace.participantId]: true }));
                    }}
                  />
                  <div className="podium-card-overlay"></div>
                  <div className="podium-bg-number">1</div>
                  <div className="podium-medal-wrapper">
                    <img src="/imagens/medalha-primeiro.webp" alt="Medalha 1º" className="podium-medal-img" />
                    <div className="medal-shine-overlay"></div>
                  </div>
                  <div className="podium-player-info-row">
                    <span className="podium-player-name">{firstPlace.name}</span>
                    {renderFireMedals(firstPlace.participantId)}
                    <div className="podium-player-pts glow-gold-text-anim">
                      <span className="pts-number">{firstPlace.points}</span>
                      <span className="pts-label">Pts</span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="podium-bg-number">1</div>
                  <div className="podium-medal-wrapper">
                    <img src="/imagens/medalha-primeiro.webp" alt="Medalha 1º" className="podium-medal-img" />
                    <div className="medal-shine-overlay"></div>
                  </div>
                  <div className="podium-fallback-avatar-container">
                    <img
                      src={getRankingAvatar(firstPlace.participantId)}
                      alt={firstPlace.name}
                      className="podium-fallback-avatar"
                      onError={(e) => {
                        e.currentTarget.src = firstPlace.avatarUrl;
                      }}
                    />
                  </div>
                  <div className="podium-player-info-row">
                    <span className="podium-player-name">{firstPlace.name}</span>
                    {renderFireMedals(firstPlace.participantId)}
                    <div className="podium-player-pts glow-gold-text-anim">
                      <span className="pts-number">{firstPlace.points}</span>
                      <span className="pts-label">Pts</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

        </div>

        {/* RESTANTE DO RANKING (3º, 4º, etc.) */}
        {remainingStandings.length > 0 && (
          <div className="standings-list-rows">
            {remainingStandings.map((standing, index) => {
              const actualRank = index + 3; // O index começa em 0, mas representa o 3º colocado
              const isThird = actualRank === 3;
              const isFourth = actualRank === 4;

              return (
                <div
                  key={standing.participantId}
                  className={`standing-row-item ${isThird ? 'is-third-row' : ''} ${isFourth ? 'is-fourth-row' : ''}`}
                >
                  <div className="standing-row-left">
                    <div className={`standing-row-rank-badge ${isThird ? 'rank-bronze' : 'rank-normal'}`}>
                      {actualRank}º
                    </div>
                    <div className="standing-row-avatar-container">
                      <img
                        src={getRankingAvatar(standing.participantId)}
                        alt={standing.name}
                        className="standing-row-avatar"
                        onError={(e) => {
                          e.currentTarget.src = standing.avatarUrl;
                        }}
                      />
                    </div>
                    <span className="standing-row-name">{standing.name}</span>
                    {renderFireMedals(standing.participantId)}
                  </div>

                  <div className="standing-row-right">
                    <span className="standing-row-pts-num">{standing.points}</span>
                    <span className="standing-row-pts-lbl">PTS</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* CARD "ON FIRE" */}
      {onFirePlayers.length > 0 && (
        <div className="on-fire-section">
          {onFirePlayers.map((player) => (
            <div key={player.standing.participantId} className="on-fire-card">
              {/* LightRays fire glow background */}
              <div className="on-fire-lightrays-container">
                <LightRays
                  raysOrigin="bottom-center"
                  raysColor="#ff4d1c"
                  raysSpeed={1.0}
                  lightSpread={0.55}
                  rayLength={1.6}
                  pulsating={true}
                  followMouse={false}
                  noiseAmount={0.03}
                  distortion={0.07}
                />
              </div>

              {/* Fire particles */}
              <div className="on-fire-particles">
                <div className="particle"></div>
                <div className="particle"></div>
                <div className="particle"></div>
                <div className="particle"></div>
                <div className="particle"></div>
                <div className="particle"></div>
                <div className="particle"></div>
                <div className="particle"></div>
              </div>

              {/* Left Flame */}
              <svg className="on-fire-flame-svg left-flame" viewBox="0 0 200 200">
                <defs>
                  <linearGradient id={`flameGradLeft-${player.standing.participantId}`} x1="0%" y1="100%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#ff4500" stopOpacity="0.4" />
                    <stop offset="60%" stopColor="#ff8c00" stopOpacity="0.15" />
                    <stop offset="100%" stopColor="#ff0000" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  d="M82.8,110.5 C72.5,95.3 75.3,73.4 89,61 C64.6,63.1 57.6,83 55.4,94.9 C46.7,85.2 46.9,65.2 55.4,53.2 C29,56.7 20,83 20,111.4 C20,152.1 50.8,180 87,180 C125.8,180 157,148.9 157,110.5 C157,75.9 130,35.2 101,20 C108,42.5 102.5,80.5 82.8,110.5 Z"
                  fill={`url(#flameGradLeft-${player.standing.participantId})`}
                />
              </svg>

              {/* Right Flame */}
              <svg className="on-fire-flame-svg right-flame" viewBox="0 0 200 200">
                <defs>
                  <linearGradient id={`flameGradRight-${player.standing.participantId}`} x1="0%" y1="100%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#ff2200" stopOpacity="0.65" />
                    <stop offset="50%" stopColor="#ff6a00" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#ffae00" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  d="M82.8,110.5 C72.5,95.3 75.3,73.4 89,61 C64.6,63.1 57.6,83 55.4,94.9 C46.7,85.2 46.9,65.2 55.4,53.2 C29,56.7 20,83 20,111.4 C20,152.1 50.8,180 87,180 C125.8,180 157,148.9 157,110.5 C157,75.9 130,35.2 101,20 C108,42.5 102.5,80.5 82.8,110.5 Z"
                  fill={`url(#flameGradRight-${player.standing.participantId})`}
                />
              </svg>

              <div className="on-fire-horizontal-content">
                {!onFireImageErrors[player.standing.participantId] ? (
                  <>
                    <div className="on-fire-portrait-container">
                      <img
                        src={getPodiumImage(player.standing.participantId)}
                        alt={player.standing.name}
                        className="on-fire-portrait-img"
                        onError={() => {
                          setOnFireImageErrors((prev) => ({ ...prev, [player.standing.participantId]: true }));
                        }}
                      />
                    </div>
                    <div className="on-fire-portrait-spacer"></div>
                  </>
                ) : (
                  <div className="on-fire-avatar-container">
                    <img
                      src={getRankingAvatar(player.standing.participantId)}
                      alt={player.standing.name}
                      className="on-fire-avatar"
                      onError={(e) => {
                        e.currentTarget.src = player.standing.avatarUrl;
                      }}
                    />
                  </div>
                )}

                <div className="on-fire-text-container">
                  <div className="on-fire-title">
                    {player.standing.name.toUpperCase()} ESTÁ ON FIRE!
                  </div>
                  <p className="on-fire-desc">
                    São 5 jogos consecutivos pontuando. Ninguém consegue parar o homem.
                  </p>
                  {(fireCounts[player.standing.participantId] || 0) > 0 && (
                    <div className="on-fire-count-badge">
                      <span className="on-fire-count-flame">🔥</span>
                      <span className="on-fire-count-num">
                        {fireCounts[player.standing.participantId]}
                      </span>
                      <span className="on-fire-count-label">
                        {fireCounts[player.standing.participantId] === 1 ? 'ON FIRE' : 'ON FIRES'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* SLIDESHOW DE IMAGENS */}
      <div style={{ marginTop: '1rem', width: '100%' }}>
        <Slideshow />
      </div>
    </div>
  );
};

export default StandingsTable;
