import { PixTab } from 'bolao-bandidos-apostados';
import { accumulated, currentUser, participants, debts, noop } from '../mock-data';

// The payment ("PIX") tab: accumulated pot, PIX key, and the "caderneta" of
// daily-fee IOUs (fiados) per participant.
export const Default = () => (
  <div style={{ width: 430, margin: '0 auto', background: '#15110E', padding: 16, minHeight: 600 }}>
    <PixTab
      accumulated={accumulated}
      currentUser={currentUser}
      participants={participants}
      debts={debts}
      onRegisterDebt={noop}
      onRemoveDebt={noop}
      onRemoveAllDebts={noop}
    />
  </div>
);
