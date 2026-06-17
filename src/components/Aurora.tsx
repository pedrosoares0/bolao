// ============================================================
// Aurora — fundo de "aurora" feito em CSS (gradientes animados).
// Antes era um shader WebGL (ogl). Trocado por CSS para funcionar em QUALQUER
// navegador (sem depender de GPU/WebGL), ficar mais leve e nunca quebrar.
// Mantém a MESMA interface de props para não mexer em quem usa (StandingsTable).
// O estilo do efeito fica em index.css (.aurora-css), usando as cores via vars.
// ============================================================
import type { CSSProperties } from 'react';

interface AuroraProps {
  colorStops?: string[];
  amplitude?: number;
  blend?: number;
  time?: number;
  speed?: number;
}

export default function Aurora({ colorStops = ['#5227FF', '#7cff67', '#5227FF'], blend = 0.5 }: AuroraProps) {
  const c1 = colorStops[0] ?? '#5227FF';
  const c2 = colorStops[1] ?? c1;
  const c3 = colorStops[2] ?? c1;

  const style = {
    '--aurora-c1': c1,
    '--aurora-c2': c2,
    '--aurora-c3': c3,
    opacity: Math.min(0.9, 0.45 + blend * 0.4),
  } as CSSProperties;

  return <div className="aurora-css" style={style} aria-hidden="true" />;
}
