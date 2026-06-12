import React from 'react';

export const Header: React.FC = () => {
  return (
    <header className="header-section">
      <div className="capa-container">
        <img 
          src="/imagens/capa.png" 
          alt="Bandidos Apostados" 
          className="capa-img"
          onError={(e) => {
            e.currentTarget.src = 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=800&auto=format&fit=crop&q=60';
          }}
        />
      </div>
    </header>
  );
};
export default Header;
