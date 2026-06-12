import React, { useState } from 'react';

// Dados do PIX para o pagamento da taxa diária do bolão
export const PIX_KEY = '7992a920-21c1-4a5c-8316-30cf039c5c43';
export const PIX_RECIPIENT = 'Rodrigo Weber';
export const PIX_BANK = 'Banco Inter';

// Pílula com a chave PIX + botão COPIAR (usada na aba Pagamento e no modal pós-aposta)
export const PixKeyRow: React.FC = () => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(PIX_KEY);
    } catch {
      // Fallback para navegadores sem clipboard API (http/webviews antigos)
      const el = document.createElement('textarea');
      el.value = PIX_KEY;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="pix-card-key-row">
      <span className="pix-card-key" title={PIX_KEY}>{PIX_KEY}</span>
      <button
        type="button"
        className={`pix-copy-btn ${copied ? 'copied' : ''}`}
        onClick={handleCopy}
      >
        {copied ? '✓ COPIADO!' : 'COPIAR'}
      </button>
    </div>
  );
};
