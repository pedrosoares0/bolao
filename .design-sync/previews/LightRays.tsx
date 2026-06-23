import { LightRays } from 'bolao-bandidos-apostados';

// LightRays is a decorative "on fire" light-rays background (CSS, absolutely
// positioned). Shown inside a sized, relative box so the rays are visible.
const Stage = ({ children }: { children: React.ReactNode }) => (
  <div style={{ position: 'relative', width: 360, height: 200, borderRadius: 16, overflow: 'hidden', background: '#15110E' }}>
    {children}
  </div>
);

export const Gold = () => (
  <Stage>
    <LightRays raysColor="#f5b300" />
  </Stage>
);

export const White = () => (
  <Stage>
    <LightRays raysColor="#ffffff" />
  </Stage>
);
