import React from 'react';
import type { Match } from '../types';

interface GameCardProps {
  match: Match;
  onSelect: () => void;
}

export const GameCard: React.FC<GameCardProps> = ({ match, onSelect }) => {
  return (
    <div 
      className="game-block" 
      onClick={onSelect}
      style={{ cursor: 'pointer' }}
    >
      <div className="game-block-header">
        {match.group} - {match.time}
      </div>

      <div className="game-block-body">
        {/* Time Mandante */}
        <div className="game-team-row">
          {/* Contêiner da Bandeira (Squircle do Modelo) */}
          <div className="game-team-flag-container">
            <img 
              src={`https://flagcdn.com/w80/${match.homeFlag.toLowerCase()}.png`} 
              alt={match.homeTeam} 
              className="game-team-flag"
              onError={(e) => {
                e.currentTarget.src = 'https://flagcdn.com/w40/un.png';
              }}
            />
          </div>
          
          {/* Caixa de Código do Time (Formato Folha/Gota do Modelo) */}
          <div className="game-team-code-box">
            {match.homeCode}
          </div>

          {/* Placar (Caixa Branca com Borda Preta Grossa) */}
          <div className="game-score-box">
            {match.homeScore !== null ? match.homeScore : ''}
          </div>
        </div>

        {/* Time Visitante */}
        <div className="game-team-row">
          {/* Contêiner da Bandeira (Squircle do Modelo) */}
          <div className="game-team-flag-container">
            <img 
              src={`https://flagcdn.com/w80/${match.awayFlag.toLowerCase()}.png`} 
              alt={match.awayTeam} 
              className="game-team-flag"
              onError={(e) => {
                e.currentTarget.src = 'https://flagcdn.com/w40/un.png';
              }}
            />
          </div>
          
          {/* Caixa de Código do Time (Formato Folha/Gota do Modelo) */}
          <div className="game-team-code-box">
            {match.awayCode}
          </div>

          {/* Placar (Caixa Branca com Borda Preta Grossa) */}
          <div className="game-score-box">
            {match.awayScore !== null ? match.awayScore : ''}
          </div>
        </div>
      </div>
    </div>
  );
};
export default GameCard;
