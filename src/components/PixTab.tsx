import React from 'react';
import { POT_PER_DAY, POT_PER_PERSON_DAY } from '../utils/pot';
import { PixKeyRow, PIX_RECIPIENT, PIX_BANK } from './PixKeyCopy';

// Helper para separar parte inteira e decimal de um valor monetário
const formatMoneyParts = (value: number) => {
  const formatted = value.toFixed(2);
  const [integerPart, decimalPart] = formatted.split('.');
  return { integerPart, decimalPart };
};

const PixPaymentCard: React.FC = () => {
  return (
    <div className="pix-payment-card">
      <div className="pix-card-title">
        <img src="https://www.thiings.co/_next/image?url=https%3A%2F%2Flftz25oez4aqbxpq.public.blob.vercel-storage.com%2Fimage-n9dmFV9wD0hKFc4BFPY2Mc7nByhtNY.png&w=320&q=75" alt="Pagamento" style={{ width: '28px', height: '28px', objectFit: 'contain', marginRight: '8px', verticalAlign: 'middle' }} /> 
        PAGAMENTO DA APOSTA DIÁRIA
      </div>

      <div className="pix-card-value-row">
        <span className="pix-card-currency">R$</span>
        <span className="pix-card-amount">2</span>
        <span className="pix-card-cents">,50</span>
        <span className="pix-card-per-day">por dia</span>
      </div>

      <div className="pix-card-recipient">
        {PIX_RECIPIENT} · {PIX_BANK}
      </div>

      <PixKeyRow />
    </div>
  );
};

import type { Participant, Debt } from '../types';

interface PixTabProps {
  accumulated: number;
  currentUser: Participant | null;
  participants: Participant[];
  debts: Debt[];
  onRegisterDebt: (userId: string, date: string) => Promise<void>;
  onRemoveDebt: (debtId: number) => Promise<void>;
  onRemoveAllDebts: (userId: string) => Promise<void>;
}

const formatIsoDateToBr = (isoDate: string) => {
  const parts = isoDate.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}`;
  }
  return isoDate;
};

export const PixTab: React.FC<PixTabProps> = ({
  accumulated,
  currentUser,
  participants,
  debts,
  onRegisterDebt,
  onRemoveDebt,
  onRemoveAllDebts,
}) => {
  const [trophyError, setTrophyError] = React.useState(false);
  const [isDebtsExpanded, setIsDebtsExpanded] = React.useState(false);
  const [expandedDebtUsers, setExpandedDebtUsers] = React.useState<Record<string, boolean>>({});
  const [confirmPayAll, setConfirmPayAll] = React.useState<
    { uid: string; count: number; total: number } | null
  >(null);
  const prizeParts = formatMoneyParts(accumulated);
  const dayValueParts = formatMoneyParts(POT_PER_DAY);
  const personValueParts = formatMoneyParts(POT_PER_PERSON_DAY);

  return (
    <div className="standings-container-modern">
      {/* CARD DO POTE ACUMULADO (aumenta R$ 10 por dia até o fim da Copa) */}
      <div className="premium-vault-card-modern">
        <div className="vault-main-display-panel">
          <div className="vault-title-accumulated">
            <span className="vault-trophy-emoji">
              {trophyError ? (
                '🏆'
              ) : (
                <img
                  src="https://i.pinimg.com/originals/bd/1e/eb/bd1eeb560e0d0f983f2c820ab159e494.png?nii=t"
                  alt="🏆"
                  className="vault-trophy-img"
                  onError={() => setTrophyError(true)}
                />
              )}
            </span>
            VALOR ACUMULADO
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

      {/* CARD DA CADERNETA DE PENDURADOS (FIADOS) */}
      <div className={`debts-premium-card ${isDebtsExpanded ? 'is-expanded' : 'is-collapsed'}`}>
        <div 
          className="debts-card-header" 
          onClick={() => setIsDebtsExpanded(!isDebtsExpanded)}
          style={{ cursor: 'pointer' }}
        >
          <img
            src="https://img.magnific.com/vetores-premium/emoticon-de-mendigo-sem-abrigo-implorando-por-dinheiro_1303870-1183.jpg?w=360"
            alt="Caderneta"
            className="debts-header-image"
          />
          <div className="debts-header-text-container">
            <div className="debts-card-title">CADERNETA DE PENDURADOS</div>
            <div className="debts-card-subtitle">Ta liso hoje? Pendure aqui e pague depois</div>
          </div>
          <button className="debts-toggle-arrow" type="button" aria-label="Toggle list">
            <svg 
              width="16" 
              height="16" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2.5" 
              strokeLinecap="round" 
              strokeLinejoin="round"
              className="chevron-icon"
            >
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
        </div>

        <div className="debts-list-wrapper">
          <div className="debts-list-inner">
            <div className="debts-list">
              {participants.map((p) => {
                const userDebts = debts.filter((d) => d.userId === p.uid);
                const totalUnpaid = userDebts.reduce((sum, d) => sum + d.amount, 0);
                const isSelf = currentUser && p.uid === currentUser.uid;

                // Pega data de hoje no fuso de Brasília
                const todayIso = new Intl.DateTimeFormat('en-CA', {
                  timeZone: 'America/Sao_Paulo',
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                }).format(new Date());

                const hasPenduradoHoje = userDebts.some((d) => d.debtDate === todayIso);
                const isUserExpanded = !!expandedDebtUsers[p.id];

                return (
                  <React.Fragment key={p.id}>
                    <div className={`debt-participant-row ${isSelf ? 'is-self' : ''}`}>
                      <div className="debt-user-profile">
                        <div className="debt-avatar-container">
                          <img
                            src={`/imagens/ranking ${p.id}.webp`}
                            alt={p.name}
                            className="debt-avatar"
                            onError={(e) => {
                              e.currentTarget.src = p.avatarUrl;
                            }}
                          />
                        </div>
                        <div className="debt-user-details">
                          <span className="debt-user-name">
                            {p.name} {isSelf && <span className="self-tag">(Você)</span>}
                          </span>
                          {userDebts.length > 0 ? (
                            <button
                              type="button"
                              className="debt-toggle-days-btn"
                              onClick={() =>
                                setExpandedDebtUsers((prev) => ({ ...prev, [p.id]: !prev[p.id] }))
                              }
                            >
                              {isUserExpanded
                                ? '▲ Ocultar dias'
                                : `▼ Ver dias pendurados (${userDebts.length})`}
                            </button>
                          ) : (
                            <span className="debt-no-debts">Em dia</span>
                          )}
                        </div>
                      </div>

                      <div className="debt-actions-area">
                        {isSelf && (
                          <>
                            {hasPenduradoHoje ? (
                              <span className="debt-status-badge today">Pendurado Hoje</span>
                            ) : (
                              <button
                                type="button"
                                className="debt-pendurar-action-btn"
                                onClick={() => onRegisterDebt(p.uid!, todayIso)}
                              >
                                <img src="https://www.thiings.co/_next/image?url=https%3A%2F%2Flftz25oez4aqbxpq.public.blob.vercel-storage.com%2Fimage-bo7jgF2brIAIRGLfOqfEWvsc6orR57.png&w=320&q=75" alt="Pendurar" style={{ width: '16px', height: '16px', objectFit: 'contain', marginRight: '4px', verticalAlign: 'middle' }} /> 
                                Pendurar
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {userDebts.length > 0 && isUserExpanded && (
                      <div className={`debt-days-expanded ${isSelf ? 'is-self' : ''}`}>
                        <div className="debt-dates-list">
                          {userDebts.map((d) => (
                            <span key={d.id} className="debt-date-badge">
                              {formatIsoDateToBr(d.debtDate)}
                              {isSelf && (
                                <button
                                  type="button"
                                  className="debt-clear-btn"
                                  onClick={() => onRemoveDebt(d.id)}
                                  title="Dar baixa neste fiado"
                                >
                                  ×
                                </button>
                              )}
                            </span>
                          ))}
                        </div>
                        <div className="debt-total-display">
                          <span className="debt-total-label">Total pendurado:</span>
                          <span className="debt-total-val">
                            R$ {totalUnpaid.toFixed(2).replace('.', ',')}
                          </span>
                        </div>

                        {isSelf && (
                          <button
                            type="button"
                            className="debt-pay-all-btn"
                            onClick={() =>
                              setConfirmPayAll({
                                uid: p.uid!,
                                count: userDebts.length,
                                total: totalUnpaid,
                              })
                            }
                          >
                            ✅ Pagar tudo
                          </button>
                        )}
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* POPUP DE CONFIRMAÇÃO — Pagar tudo */}
      {confirmPayAll && (
        <div className="pix-modal-overlay" onClick={() => setConfirmPayAll(null)}>
          <div className="pix-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="pix-modal-emoji">💸</div>
            <div className="pix-card-title">QUITAR FIADOS</div>
            <div className="pix-modal-text">
              Dar baixa em <b>todos os {confirmPayAll.count} fiados</b> pendurados, no total de{' '}
              <b>R$ {confirmPayAll.total.toFixed(2).replace('.', ',')}</b>?
            </div>
            <div className="confirm-modal-actions">
              <button
                type="button"
                className="confirm-modal-cancel-btn"
                onClick={() => setConfirmPayAll(null)}
              >
                CANCELAR
              </button>
              <button
                type="button"
                className="confirm-modal-confirm-btn"
                onClick={() => {
                  const uid = confirmPayAll.uid;
                  setConfirmPayAll(null);
                  onRemoveAllDebts(uid);
                }}
              >
                ✅ PAGAR TUDO
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PixTab;

