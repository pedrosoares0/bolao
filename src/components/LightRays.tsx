// ============================================================
// LightRays — raios/brilho "on fire" feito em CSS (sem WebGL).
// Antes era um shader WebGL (ogl). Trocado por CSS para funcionar em qualquer
// navegador, ser mais leve e nunca quebrar. Puramente decorativo.
// Mantém a MESMA interface de props para não mexer em quem usa (StandingsTable).
// O estilo fica em index.css (.lightrays-css), usando a cor via variável.
// ============================================================
import type { CSSProperties } from 'react';

export type RaysOrigin =
  | 'top-center'
  | 'top-left'
  | 'top-right'
  | 'right'
  | 'left'
  | 'bottom-center'
  | 'bottom-right'
  | 'bottom-left';

interface LightRaysProps {
  raysOrigin?: RaysOrigin;
  raysColor?: string;
  raysSpeed?: number;
  lightSpread?: number;
  rayLength?: number;
  pulsating?: boolean;
  fadeDistance?: number;
  saturation?: number;
  followMouse?: boolean;
  mouseInfluence?: number;
  noiseAmount?: number;
  distortion?: number;
  className?: string;
}

function LightRays({ raysColor = '#ffffff', className = '' }: LightRaysProps) {
  const style = { '--rays-color': raysColor } as CSSProperties;
  return <div className={`lightrays-css ${className}`} style={style} aria-hidden="true" />;
}

export default LightRays;
