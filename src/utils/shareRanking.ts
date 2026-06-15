import type { ParticipantStanding } from '../types';

// Desenha um retângulo arredondado no contexto do canvas
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Gera um PNG (Blob) com o card do ranking — desenhado 100% no canvas,
// sem imagens externas (evita problemas de CORS).
export async function buildRankingPng(
  standings: ParticipantStanding[],
  fireCounts: Record<string, number> = {},
  rankChanges: Record<string, number> = {}
): Promise<Blob> {
  const W = 720;
  const rows = standings.slice(0, 8);
  const headerH = 220;
  const rowH = 86;
  const gap = 14;
  const footerH = 70;
  const H = headerH + rows.length * (rowH + gap) + footerH;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Fundo
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#1a1410');
  bg.addColorStop(1, '#0b0807');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Brilho dourado no topo
  const glow = ctx.createRadialGradient(W / 2, 0, 10, W / 2, 0, W);
  glow.addColorStop(0, 'rgba(245,179,0,0.22)');
  glow.addColorStop(1, 'rgba(245,179,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, headerH);

  // Cabeçalho
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#f5b300';
  ctx.font = '900 62px Arial, sans-serif';
  ctx.fillText('🏆 RANKING', W / 2, 108);
  ctx.fillStyle = '#F2ECDD';
  ctx.font = '700 30px Arial, sans-serif';
  ctx.fillText('Bandidos Apostados', W / 2, 152);

  const dateStr = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date());
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '600 22px Arial, sans-serif';
  ctx.fillText(dateStr, W / 2, 188);

  // Linhas do ranking
  const medals = ['🥇', '🥈', '🥉'];
  let y = headerH;
  ctx.textBaseline = 'middle';
  rows.forEach((s, i) => {
    const x = 40;
    const w = W - 80;
    const cy = y + rowH / 2;
    const isTop = i === 0;

    ctx.fillStyle = isTop ? 'rgba(245,179,0,0.12)' : 'rgba(255,255,255,0.04)';
    roundRect(ctx, x, y, w, rowH, 18);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = isTop ? 'rgba(245,179,0,0.5)' : 'rgba(255,255,255,0.08)';
    ctx.stroke();

    // Posição / medalha
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 38px Arial, sans-serif';
    ctx.fillText(i < 3 ? medals[i] : `${i + 1}º`, x + 24, cy + 2);

    // Nome + fogo
    const fire = fireCounts[s.participantId] || 0;
    let nameText = s.name;
    if (fire > 0) nameText += '  ' + '🔥'.repeat(Math.min(fire, 3)) + (fire > 3 ? ` x${fire}` : '');
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 34px Arial, sans-serif';
    ctx.fillText(nameText, x + 100, cy + 2);

    // Seta de evolução (número elevado ao lado do nome)
    const change = rankChanges[s.participantId] || 0;
    if (change !== 0) {
      const nameW = ctx.measureText(nameText).width;
      ctx.fillStyle = change > 0 ? '#4ade80' : '#f87171';
      ctx.font = '900 20px Arial, sans-serif';
      ctx.fillText(`${change > 0 ? '▲' : '▼'}${Math.abs(change)}`, x + 100 + nameW + 12, cy - 12);
    }

    // Pontos
    ctx.textAlign = 'right';
    ctx.fillStyle = '#f5b300';
    ctx.font = '900 40px Arial, sans-serif';
    ctx.fillText(String(s.points), x + w - 78, cy + 2);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '700 22px Arial, sans-serif';
    ctx.fillText('pts', x + w - 22, cy + 4);

    y += rowH + gap;
  });

  // Rodapé
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = '600 22px Arial, sans-serif';
  ctx.fillText('⚽ Copa do Mundo 2026', W / 2, H - 28);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob falhou'))), 'image/png');
  });
}

// Compartilha o ranking: tenta a Web Share API (com imagem); se não houver
// suporte, baixa o PNG. Retorna 'shared' | 'downloaded' | 'cancelled'.
export async function shareRanking(
  standings: ParticipantStanding[],
  fireCounts: Record<string, number> = {},
  rankChanges: Record<string, number> = {}
): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const blob = await buildRankingPng(standings, fireCounts, rankChanges);
  const file = new File([blob], 'ranking-bandidos.png', { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };

  try {
    if (nav.canShare && nav.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: 'Ranking — Bandidos Apostados',
        text: 'Olha o ranking do bolão! 🏆⚽',
      });
      return 'shared';
    }
  } catch (err) {
    // Usuário cancelou o compartilhamento
    if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
  }

  // Fallback: baixar a imagem
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ranking-bandidos.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return 'downloaded';
}
