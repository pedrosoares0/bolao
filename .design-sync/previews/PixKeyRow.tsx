import { PixKeyRow } from 'bolao-bandidos-apostados';

// The PIX key pill + COPIAR button, as used on the payment tab and the
// post-bet modal. No props — it owns its own copy-to-clipboard state.
export const Default = () => (
  <div style={{ width: 380, padding: 24, background: '#15110E', borderRadius: 16 }}>
    <PixKeyRow />
  </div>
);
