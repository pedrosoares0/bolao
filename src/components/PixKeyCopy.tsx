import React, { useState } from 'react';

// Dados do PIX para o pagamento da taxa diária do bolão
export const PIX_KEY = '7992a920-21c1-4a5c-8316-30cf039c5c43';
export const PIX_RECIPIENT = 'Rodrigo Weber';
export const PIX_BANK = 'Banco Inter';

// Pílula com a chave PIX + botão COPIAR (usada na aba Pagamento e no modal pós-aposta).
// Aceita uma chave por prop (PIX do grupo); sem prop, usa a chave global padrão.
export const PixKeyRow: React.FC<{ pixKey?: string }> = ({ pixKey = PIX_KEY }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(pixKey);
    } catch {
      // Fallback para navegadores sem clipboard API (http/webviews antigos)
      const el = document.createElement('textarea');
      el.value = pixKey;
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
      <span className="pix-card-key" title={pixKey}>{pixKey}</span>
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
