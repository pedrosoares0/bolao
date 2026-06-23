import { Aurora } from 'bolao-bandidos-apostados';

// Aurora is a decorative animated-gradient background (absolutely positioned,
// fills its nearest positioned ancestor). Shown here inside a sized, relative
// box so the effect is visible. Two color treatments.
const Stage = ({ children }: { children: React.ReactNode }) => (
  <div style={{ position: 'relative', width: 360, height: 200, borderRadius: 16, overflow: 'hidden', background: '#15110E' }}>
    {children}
  </div>
);

export const BrazilGreen = () => (
  <Stage>
    <Aurora colorStops={['#009c3b', '#f5b300', '#009c3b']} blend={0.6} amplitude={1.0} />
  </Stage>
);

export const VioletBlend = () => (
  <Stage>
    <Aurora colorStops={['#5227FF', '#7cff67', '#5227FF']} blend={0.5} amplitude={1.0} />
  </Stage>
);
