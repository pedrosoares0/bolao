import React, { useState } from 'react';
import { POT_PER_DAY, POT_PER_PERSON_DAY } from '../utils/pot';

// Dados do PIX para o pagamento da taxa diária do bolão
const PIX_KEY = '7992a920-21c1-4a5c-8316-30cf039c5c43';
const PIX_RECIPIENT = 'Rodrigo Weber';
const PIX_BANK = 'Banco Inter';

// Helper para separar parte inteira e decimal de um valor monetário
const formatMoneyParts = (value: number) => {
  const formatted = value.toFixed(2);
  const [integerPart, decimalPart] = formatted.split('.');
  return { integerPart, decimalPart };
};

const PixPaymentCard: React.FC = () => {
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
    <div className="pix-payment-card">
      <div className="pix-card-title">💸 PAGAMENTO DA APOSTA DIÁRIA</div>

      <div className="pix-card-value-row">
        <span className="pix-card-currency">R$</span>
        <span className="pix-card-amount">2</span>
        <span className="pix-card-cents">,50</span>
        <span className="pix-card-per-day">por dia</span>
      </div>

      <div className="pix-card-recipient">
        {PIX_RECIPIENT} · {PIX_BANK}
      </div>

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
    </div>
  );
};

interface PixTabProps {
  accumulated: number;
}

export const PixTab: React.FC<PixTabProps> = ({ accumulated }) => {
  const prizeParts = formatMoneyParts(accumulated);
  const dayValueParts = formatMoneyParts(POT_PER_DAY);
  const personValueParts = formatMoneyParts(POT_PER_PERSON_DAY);

  return (
    <div className="standings-container-modern">
      {/* CARD DO POTE ACUMULADO (aumenta R$ 10 por dia até o fim da Copa) */}
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

      {/* CARD DE PAGAMENTO VIA PIX */}
      <PixPaymentCard />
    </div>
  );
};

export default PixTab;
