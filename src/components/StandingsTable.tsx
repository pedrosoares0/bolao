// ============================================================
// StandingsTable — aba "Ranking". Mostra o MVP da rodada, o pódio (1º/2º),
// o restante da classificação, o card "On Fire" (sequências de acertos), um
// deck 3D de fotos dos participantes e o botão de compartilhar o ranking como
// imagem (utils/shareRanking.ts). Aurora/LightRays são fundos WebGL.
// ============================================================
import React from 'react';
import type { ParticipantStanding, Match, Bet } from '../types';
import { analyzeBet, calculateFireCounts } from '../utils/rules';
import { shareRanking } from '../utils/shareRanking';
import LightRays from './LightRays';
import Aurora from './Aurora';

interface StandingsTableProps {
  standings: ParticipantStanding[]; // já ordenado (ver calculateStandings)
  matches: Match[];
  bets: Bet[];
  rankChanges?: Record<string, number>; // variação de posição desde a última rodada
}

// Deck 3D de fotos dos participantes com arraste/swipe (puramente visual)
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
                  <img loading="lazy" decoding="async"
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

export const StandingsTable: React.FC<StandingsTableProps> = ({ standings, matches, bets, rankChanges }) => {
  const [imageErrors, setImageErrors] = React.useState<Record<string, boolean>>({});
  const [sharing, setSharing] = React.useState(false);
  const [onFireImageErrors, setOnFireImageErrors] = React.useState<Record<string, boolean>>({});

  // Helper para obter a data de ontem formatada como DD/MM
  const getYesterdayLabel = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const fmt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
    return fmt.format(d);
  };

  // Helper para obter a imagem de ranking específica do participante
  const getRankingAvatar = (participantId: string) => {
    return `/imagens/ranking ${participantId}.webp`;
  };

  // Helper para obter a imagem do pódio (toma o card todo)
  const getPodiumImage = (participantId: string) => {
    return `/imagens/${participantId}-1ou2.webp`;
  };

  // A lista de onFirePlayers será definida logo após o cálculo de fireCounts, 
  // pois a regra agora é que o card do ON FIRE seja uma conquista permanente (tipo Steam).

  // Conta quantos "onfires" (medalhas de fogo) cada participante já conquistou.
  // Usa a regra compartilhada em utils/rules (calculateFireCounts): ganha +1 fogo
  // PERMANENTE ao pontuar em 5 jogos seguidos OU acertar o placar exato em 3 jogos
  // seguidos. Os fogos já conquistados nunca são removidos.
  const fireCounts = React.useMemo<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    const participants = standings.map((s) => ({
      id: s.participantId,
      name: s.name,
      avatarUrl: s.avatarUrl,
    }));
    const raw = calculateFireCounts(matches, bets, participants);
    Object.keys(raw).forEach((id) => { counts[id] = raw[id].fires; });
    return counts;
  }, [standings, matches, bets]);

  const onFirePlayers = standings
    .filter(standing => (fireCounts[standing.participantId] || 0) > 0)
    .map(standing => ({ standing }));

  // MVP da Rodada: quem fez mais pontos no dia finalizado mais recente
  // EM QUE TODOS OS JOGOS DESSE DIA FORAM CONCLUÍDOS. Desempate por nº de placares exatos.
  const roundMvp = ((): { standing: ParticipantStanding; pts: number; dateLabel: string } | null => {
    if (!matches || !bets) return null;

    // Todas as datas que possuem algum jogo
    const allDates = Array.from(new Set(matches.map((m) => m.isoDate)));

    // Filtrar apenas datas em que TODOS os jogos cadastrados já terminaram (status === 'finished')
    const completedDates = allDates.filter((iso) => {
      const dayMatches = matches.filter((m) => m.isoDate === iso);
      return dayMatches.length > 0 && dayMatches.every(
        (m) => m.status === 'finished' && m.homeScore !== null && m.awayScore !== null
      );
    });

    if (completedDates.length === 0) return null;

    // Datas finalizadas, da mais recente para a mais antiga (pelo kickoff mais recente de cada data)
    const sortedCompletedDates = completedDates.sort((a, b) => {
      const ka = Math.max(...matches.filter((m) => m.isoDate === a).map((m) => Date.parse(m.kickoff)));
      const kb = Math.max(...matches.filter((m) => m.isoDate === b).map((m) => Date.parse(m.kickoff)));
      return kb - ka;
    });

    for (const iso of sortedCompletedDates) {
      const dayMatches = matches.filter((m) => m.isoDate === iso);
      const scored = standings
        .map((s) => {
          let pts = 0;
          let exacts = 0;
          dayMatches.forEach((m) => {
            const bet = bets.find((b) => b.matchId === m.id && b.participantId === s.participantId);
            const a = analyzeBet(bet, m);
            pts += a.points;
            if (a.type === 'exact') exacts++;
          });
          return { standing: s, pts, exacts };
        })
        .filter((x) => x.pts > 0)
        .sort((a, b) => b.pts - a.pts || b.exacts - a.exacts);

      if (scored.length > 0) {
        const best = scored[0];
        return { standing: best.standing, pts: best.pts, dateLabel: dayMatches[0]?.date ?? '' };
      }
    }
    return null;
  })();

  // Renderiza as medalhas de fogo ao lado do nome no ranking.
  const renderFireMedals = (participantId: string) => {
    const count = fireCounts[participantId] || 0;
    if (count <= 0) return null;
    return (
      <span
        className="fire-medal-badge"
        title={`${count} On Fire — pontuou em 5 jogos seguidos ou acertou 3 placares exatos seguidos`}
      >
        <span className="fire-medal-flame">🔥</span>
        {count > 1 && <span className="fire-medal-count">{count}</span>}
      </span>
    );
  };

  // Seta de evolução no ranking (subiu/caiu/manteve desde a última rodada)
  const renderRankChange = (participantId: string) => {
    const c = rankChanges?.[participantId];
    if (c == null || c === 0) {
      return (
        <span className="rank-change neutral" title="Manteve a posição">
          -
        </span>
      );
    }
    if (c > 0)
      return (
        <span className="rank-change up" title={`Subiu ${c} posição(ões)`}>
          ▲{c}
        </span>
      );
    if (c < 0)
      return (
        <span className="rank-change down" title={`Caiu ${Math.abs(c)} posição(ões)`}>
          ▼{Math.abs(c)}
        </span>
      );
    return null;
  };

  const handleShare = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      await shareRanking(standings, fireCounts, rankChanges ?? {});
    } finally {
      setSharing(false);
    }
  };

  const firstPlace = standings[0];
  const secondPlace = standings[1];
  const remainingStandings = standings.slice(2);

  return (
    <div className="standings-container-modern">
      {/* MVP DA RODADA (quem mais pontuou no último dia finalizado) */}
      {roundMvp && (
        <>
          <div className="round-mvp-card">
            <Aurora
              colorStops={["#ffe066", "#f5b300", "#c58c00"]}
              blend={0.5}
              amplitude={1.0}
              speed={0.5}
            />
            <div className="round-mvp-avatar-wrap">
              <img loading="lazy" decoding="async"
                src={getRankingAvatar(roundMvp.standing.participantId)}
                alt={roundMvp.standing.name}
                className="round-mvp-avatar"
                onError={(e) => {
                  e.currentTarget.src = roundMvp.standing.avatarUrl;
                }}
              />
            </div>

            <div className="round-mvp-content">
              <div className="round-mvp-meta">
                <img loading="lazy" decoding="async"
                  src="/imagens/coroa-mvp.png"
                  alt="Coroa MVP"
                  className="round-mvp-crown-img"
                />
                <span className="round-mvp-label glow-gold-text-anim">MVP</span>
                <span className="round-mvp-badge">{roundMvp.dateLabel}</span>
              </div>
              <span className="round-mvp-name">{roundMvp.standing.name}</span>
            </div>

            <div className="round-mvp-pts">
              <span className="round-mvp-pts-num glow-gold-text-anim">{roundMvp.pts}</span>
              <div className="round-mvp-pts-label-stack">
                <span className="round-mvp-pts-lbl-main">pts.</span>
                <span className="round-mvp-pts-lbl-sub">
                  {roundMvp.dateLabel === getYesterdayLabel() ? 'ontem' : roundMvp.dateLabel}
                </span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* RANKING CONTAINER COM LUZ DOURADA E FUNDO ESCURO */}
      <div className="ranking-podium-section">
        <Aurora
          colorStops={["#ffe066", "#f5b300", "#c58c00"]}
          blend={0.5}
          amplitude={1.0}
          speed={0.5}
        />

        {/* PODIUM CARDS (1º e 2º lugares) */}
        <div className="podium-cards-container">

          {/* SEGUNDO LUGAR (Esquerda, menor) */}
          {secondPlace && (
            <div className={`podium-card second-place-card ${imageErrors[secondPlace.participantId] ? 'has-error' : ''}`}>
              {!imageErrors[secondPlace.participantId] ? (
                <>
                  <img loading="lazy" decoding="async"
                    src={getPodiumImage(secondPlace.participantId)}
                    alt={secondPlace.name}
                    className="podium-card-img-bg"
                    onError={() => {
                      setImageErrors((prev) => ({ ...prev, [secondPlace.participantId]: true }));
                    }}
                  />
                  <div className="podium-card-overlay"></div>
                  <div className="podium-rank-badge">2º</div>
                  <div className="podium-medal-wrapper">
                    <img loading="lazy" decoding="async" src="/imagens/medalha-segundo.webp" alt="Medalha 2º" className="podium-medal-img" />
                    <div className="medal-shine-overlay"></div>
                  </div>
                  <div className="podium-player-info-row">
                    <span className="podium-name-with-rank" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <div style={{ transform: 'scale(0.8)' }}>{renderRankChange(secondPlace.participantId)}</div>
                      <span className="podium-player-name">{secondPlace.name}</span>
                      {renderFireMedals(secondPlace.participantId)}
                    </span>
                    <div className="podium-player-pts glow-silver-text-anim">
                      <span className="pts-number">{secondPlace.points}</span>
                      <span className="pts-label">Pts</span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="podium-rank-badge">2º</div>
                  <div className="podium-medal-wrapper">
                    <img loading="lazy" decoding="async" src="/imagens/medalha-segundo.webp" alt="Medalha 2º" className="podium-medal-img" />
                    <div className="medal-shine-overlay"></div>
                  </div>
                  <div className="podium-fallback-avatar-container">
                    <img loading="lazy" decoding="async"
                      src={getRankingAvatar(secondPlace.participantId)}
                      alt={secondPlace.name}
                      className="podium-fallback-avatar"
                      onError={(e) => {
                        e.currentTarget.src = secondPlace.avatarUrl;
                      }}
                    />
                  </div>
                  <div className="podium-player-info-row">
                    <span className="podium-name-with-rank" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <div style={{ transform: 'scale(0.8)' }}>{renderRankChange(secondPlace.participantId)}</div>
                      <span className="podium-player-name">{secondPlace.name}</span>
                      {renderFireMedals(secondPlace.participantId)}
                    </span>
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
                  <img loading="lazy" decoding="async"
                    src={getPodiumImage(firstPlace.participantId)}
                    alt={firstPlace.name}
                    className="podium-card-img-bg"
                    onError={() => {
                      setImageErrors((prev) => ({ ...prev, [firstPlace.participantId]: true }));
                    }}
                  />
                  <div className="podium-card-overlay"></div>
                  <div className="podium-rank-badge">1º</div>
                  <div className="podium-medal-wrapper">
                    <img loading="lazy" decoding="async" src="/imagens/medalha-primeiro.webp" alt="Medalha 1º" className="podium-medal-img" />
                    <div className="medal-shine-overlay"></div>
                  </div>
                  <div className="podium-player-info-row">
                    <span className="podium-name-with-rank" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <div style={{ transform: 'scale(0.8)' }}>{renderRankChange(firstPlace.participantId)}</div>
                      <span className="podium-player-name">{firstPlace.name}</span>
                      {renderFireMedals(firstPlace.participantId)}
                    </span>
                    <div className="podium-player-pts glow-gold-text-anim">
                      <span className="pts-number">{firstPlace.points}</span>
                      <span className="pts-label">Pts</span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="podium-rank-badge">1º</div>
                  <div className="podium-medal-wrapper">
                    <img loading="lazy" decoding="async" src="/imagens/medalha-primeiro.webp" alt="Medalha 1º" className="podium-medal-img" />
                    <div className="medal-shine-overlay"></div>
                  </div>
                  <div className="podium-fallback-avatar-container">
                    <img loading="lazy" decoding="async"
                      src={getRankingAvatar(firstPlace.participantId)}
                      alt={firstPlace.name}
                      className="podium-fallback-avatar"
                      onError={(e) => {
                        e.currentTarget.src = firstPlace.avatarUrl;
                      }}
                    />
                  </div>
                  <div className="podium-player-info-row">
                    <span className="podium-name-with-rank" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <div style={{ transform: 'scale(0.8)' }}>{renderRankChange(firstPlace.participantId)}</div>
                      <span className="podium-player-name">{firstPlace.name}</span>
                      {renderFireMedals(firstPlace.participantId)}
                    </span>
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
          <div className="standings-list-rows" style={{ position: 'relative', zIndex: 2 }}>
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
                      <img loading="lazy" decoding="async"
                        src={getRankingAvatar(standing.participantId)}
                        alt={standing.name}
                        className="standing-row-avatar"
                        onError={(e) => {
                          e.currentTarget.src = standing.avatarUrl;
                        }}
                      />
                    </div>
                    <span className="standing-name-with-rank">
                      <span className="standing-row-name">{standing.name}</span>
                      {renderFireMedals(standing.participantId)}
                    </span>
                    {renderRankChange(standing.participantId)}
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

      {/* BOTÃO DE COMPARTILHAR O RANKING */}
      <div className="ranking-share-header" style={{ marginTop: '1rem', marginBottom: '1rem', position: 'relative', zIndex: 2 }}>
        <button type="button" className="ranking-share-btn" onClick={handleShare} disabled={sharing} style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
          {sharing ? (
            '⏳ Gerando...'
          ) : (
            <>
              <img loading="lazy" decoding="async"
                src="https://www.thiings.co/_next/image?url=https%3A%2F%2Flftz25oez4aqbxpq.public.blob.vercel-storage.com%2Fimage-zKoxdD3l5QDuQDFQGP45fqO0EuaKqP.png&w=320&q=75"
                alt="Compartilhar"
                style={{ width: '20px', height: '20px', objectFit: 'contain' }}
              />
              Compartilhar
            </>
          )}
        </button>
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
                      <img loading="lazy" decoding="async"
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
                    <img loading="lazy" decoding="async"
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
                    Pontuou em 5 jogos seguidos ou cravou 3 placares exatos em sequência. Ninguém consegue parar o homem.
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
