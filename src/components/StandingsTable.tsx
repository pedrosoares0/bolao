import React, { useState, useEffect } from 'react';
import type { ParticipantStanding } from '../types';

interface StandingsTableProps {
  standings: ParticipantStanding[];
  accumulated: number;
}

const Slideshow: React.FC = () => {
  const images = [
    '/imagens/pedro-slide.webp',
    '/imagens/neto-slide.webp',
    '/imagens/rodrigo-slide.webp',
    '/imagens/alex-slide.webp'
  ];
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % images.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="slideshow-container">
      {images.map((img, index) => (
        <img
          key={img}
          src={img}
          alt={`slide-${index}`}
          className={`slideshow-img ${index === currentIndex ? 'active' : ''} ${index === 0 ? 'first-slide' : ''}`}
        />
      ))}
    </div>
  );
};

export const StandingsTable: React.FC<StandingsTableProps> = ({ standings, accumulated }) => {
  const totalAccumulated = accumulated;

  // Helper para obter a imagem de ranking específica do participante
  const getRankingAvatar = (participantId: string) => {
    return `/imagens/ranking ${participantId}.webp`;
  };

  // Helper para separar parte inteira e decimal de um valor monetário
  const formatMoneyParts = (value: number) => {
    const formatted = value.toFixed(2);
    const [integerPart, decimalPart] = formatted.split('.');
    return { integerPart, decimalPart };
  };

  const prizeParts = formatMoneyParts(totalAccumulated);
  const dayValueParts = formatMoneyParts(10.00);
  const personValueParts = formatMoneyParts(2.50);

  // Cores por POSIÇÃO (não por nome)
  // 1º = amarelo, 2º = verde, 3º = azul, 4º+ = bege
  const getRankPillClass = (index: number) => {
    switch (index) {
      case 0: return 'rank-pill-gold';
      case 1: return 'rank-pill-green';
      case 2: return 'rank-pill-blue';
      default: return 'rank-pill-cream';
    }
  };

  // Texto escuro apenas para fundo bege (posição >= 4), branco para amarelo (1º), verde (2º) e azul (3º)
  const isDarkTextForIndex = (index: number) => {
    return index >= 3;
  };

  // Emoji/ícone de posição
  const getRankIcon = (index: number) => {
    switch (index) {
      case 0: return '🥇';
      case 1: return '🥈';
      case 2: return '🥉';
      default: return `${index + 1}º`;
    }
  };

  return (
    <div className="standings-container-modern">

      {/* SLIDESHOW DE IMAGENS */}
      <Slideshow />

      {/* CARD DO POTE ACUMULADO */}
      <div className="premium-vault-card-modern">
        <div className="vault-main-display-panel">
          <div className="vault-title-accumulated">
            🏆 VALOR ACUMULADO
          </div>

          <div className="vault-prize-large-display">
            <span className="vault-currency">R$</span>
            <span className="vault-integer">{prizeParts.integerPart}</span>
            <span className="vault-decimals">,{prizeParts.decimalPart}</span>
          </div>
        </div>

        <div className="vault-details-bottom">
          <div className="vault-detail-column">
            <span className="vd-label-pote">VALOR/DIA</span>
            <div className="vd-value-pote">
              <span className="vd-curr">R$</span>
              <span className="vd-int">{dayValueParts.integerPart}</span>
              <span className="vd-dec">,{dayValueParts.decimalPart}</span>
            </div>
          </div>

          <div className="vault-detail-column">
            <span className="vd-label-pote">VALOR/PESSOA</span>
            <div className="vd-value-pote">
              <span className="vd-curr">R$</span>
              <span className="vd-int">{personValueParts.integerPart}</span>
              <span className="vd-dec">,{personValueParts.decimalPart}</span>
            </div>
          </div>
        </div>
      </div>

      {/* RANKING */}
      <div className="standings-list-pills">
        {standings.map((standing, index) => {
          const pillClass = getRankPillClass(index);
          const darkText = isDarkTextForIndex(index);

          return (
            <div
              key={standing.participantId}
              className={`standing-pill-item ${pillClass}`}
            >
              {/* Badge de posição */}
              <div className="standing-pill-rank-badge">
                <span>{getRankIcon(index)}</span>
              </div>

              <div className="standing-pill-left">
                <div className="standing-pill-avatar-container-clean">
                  <img
                    src={getRankingAvatar(standing.participantId)}
                    alt={standing.name}
                    className="standing-pill-avatar"
                    onError={(e) => {
                      e.currentTarget.src = standing.avatarUrl;
                    }}
                  />
                </div>

                <div className="standing-pill-info">
                  <span className={`standing-pill-name ${darkText ? 'text-dark' : 'text-white'}`}>
                    {standing.name}
                  </span>
                </div>
              </div>

              <div className="standing-pill-right">
                <span className={`standing-pill-pts-num ${darkText ? 'text-dark' : 'text-white'}`}>
                  {standing.points}
                </span>
                <span className={`standing-pill-pts-lbl ${darkText ? 'text-dark-muted' : 'text-white-muted'}`}>
                  PTS
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
export default StandingsTable;
