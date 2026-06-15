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

const loadImage = (src: string): Promise<HTMLImageElement | null> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null); // Ignora erros de CORS ou imagem inexistente
    img.src = src;
  });
};

const loadAvatar = async (participantId: string, avatarUrl?: string) => {
  let img = await loadImage(`/imagens/ranking ${participantId}.webp`);
  if (!img && avatarUrl) {
    img = await loadImage(avatarUrl);
  }
  return img;
};

const loadPodium = async (id: string, avatarUrl?: string) => {
  let img = await loadImage(`/imagens/${id}-1ou2.webp`);
  if (!img) {
    img = await loadAvatar(id, avatarUrl);
  }
  return img;
};

// Gera um PNG (Blob) com o card do ranking — desenhado 100% no canvas
export async function buildRankingPng(
  standings: ParticipantStanding[],
  fireCounts: Record<string, number> = {},
  rankChanges: Record<string, number> = {}
): Promise<Blob> {
  const W = 720;
  
  const firstPlace = standings[0];
  const secondPlace = standings[1];
  const rows = standings.slice(2, 8); // 3º ao 8º
  const rowH = 86;
  const gap = 14;
  const footerH = 40;

  // Carregar imagens em paralelo
  const [cover, medal1, medal2, podium1, podium2, ...avatars] = await Promise.all([
    loadImage('/imagens/capa-compartilhamento.webp'),
    loadImage('/imagens/medalha-primeiro.webp'),
    loadImage('/imagens/medalha-segundo.webp'),
    firstPlace ? loadPodium(firstPlace.participantId, firstPlace.avatarUrl) : Promise.resolve(null),
    secondPlace ? loadPodium(secondPlace.participantId, secondPlace.avatarUrl) : Promise.resolve(null),
    ...rows.map((s) => loadAvatar(s.participantId, s.avatarUrl)),
  ]);

  const coverH = cover ? (cover.height / cover.width) * W : 0;
  const headerH = cover ? coverH + 60 : 280;
  
  const podiumH = (firstPlace || secondPlace) ? 440 : 0;
  
  const H = headerH + podiumH + (rows.length > 0 ? rows.length * (rowH + gap) : 0) + footerH;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Máscara (clip) de bordas arredondadas para toda a imagem
  const radius = 32;
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.arcTo(W, 0, W, H, radius);
  ctx.arcTo(W, H, 0, H, radius);
  ctx.arcTo(0, H, 0, 0, radius);
  ctx.arcTo(0, 0, W, 0, radius);
  ctx.closePath();
  ctx.clip();

  // Fundo
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#1a1410');
  bg.addColorStop(1, '#0b0807');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Brilho dourado
  const glow = ctx.createRadialGradient(W / 2, 0, 10, W / 2, 0, W);
  glow.addColorStop(0, 'rgba(245,179,0,0.22)');
  glow.addColorStop(1, 'rgba(245,179,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, headerH);

  // Cabeçalho (Capa e Data)
  if (cover) {
    ctx.drawImage(cover, 0, 0, W, coverH);
  } else {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#f5b300';
    ctx.font = '900 62px Arial, sans-serif';
    ctx.fillText('🏆 RANKING', W / 2, 108);
  }

  const dateStr = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date());
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '600 22px Arial, sans-serif';
  const dateY = cover ? coverH + 34 : 240;
  ctx.fillText(dateStr, W / 2, dateY);

  let currentY = headerH;

  const drawPodiumCard = (
    standing: ParticipantStanding,
    pos: 1 | 2,
    img: HTMLImageElement | null,
    medal: HTMLImageElement | null,
    x: number, y: number, w: number, h: number
  ) => {
    ctx.save();
    roundRect(ctx, x, y, w, h, 24);
    ctx.clip();
    
    if (img) {
      const imgRatio = img.width / img.height;
      const boxRatio = w / h;
      let sx, sy, sw, sh;
      if (imgRatio > boxRatio) {
         sh = img.height;
         sw = img.height * boxRatio;
         sx = (img.width - sw) / 2;
         sy = 0;
      } else {
         sw = img.width;
         sh = img.width / boxRatio;
         sx = 0;
         sy = (img.height - sh) / 2;
      }
      ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(x, y, w, h);
    }
    
    const grad = ctx.createLinearGradient(0, y + h - 160, 0, y + h);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.95)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y + h - 160, w, 160);
    
    ctx.fillStyle = pos === 1 ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.7)';
    ctx.font = '900 120px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(String(pos), x + 16, y + 16);
    
    ctx.restore();
    
    if (medal) {
       const mSize = pos === 1 ? 84 : 70;
       ctx.drawImage(medal, x + w - mSize/2 - 20, y - mSize/2 + 10, mSize, mSize);
    }
    
    ctx.textBaseline = 'alphabetic';
    const nameText = standing.name;
    const ptsText = String(standing.points);
    
    const change = rankChanges[standing.participantId] || 0;
    let chText = '-';
    if(change>0) chText = `▲${change}`;
    else if(change<0) chText = `▼${Math.abs(change)}`;
    
    ctx.textAlign = 'left';
    ctx.fillStyle = change > 0 ? '#4ade80' : change < 0 ? '#f87171' : 'rgba(255,255,255,0.5)';
    ctx.font = '900 20px Arial, sans-serif';
    ctx.fillText(chText, x + 20, y + h - 28);
    const chW = ctx.measureText(chText).width;
    
    ctx.fillStyle = '#fff';
    ctx.font = '800 28px Arial, sans-serif';
    ctx.fillText(nameText, x + 20 + chW + 8, y + h - 28);
    
    const fire = fireCounts[standing.participantId] || 0;
    if (fire > 0) {
      const nameW = ctx.measureText(nameText).width;
      ctx.font = '24px Arial, sans-serif';
      ctx.fillText('🔥', x + 20 + chW + 8 + nameW + 8, y + h - 28);
    }
    
    ctx.textAlign = 'right';
    ctx.fillStyle = pos === 1 ? '#f5b300' : '#c0c0c0';
    ctx.font = '900 36px Arial, sans-serif';
    ctx.fillText(ptsText, x + w - 46, y + h - 28);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '700 20px Arial, sans-serif';
    ctx.fillText('Pts', x + w - 16, y + h - 28);
  };

  if (podiumH > 0) {
    const pCenterY = currentY + podiumH / 2;
    if (secondPlace) {
      drawPodiumCard(secondPlace, 2, podium2, medal2, 44, pCenterY - 170 + 20, 300, 340);
    }
    if (firstPlace) {
      drawPodiumCard(firstPlace, 1, podium1, medal1, 44 + 300 + 24, pCenterY - 195 - 10, 310, 390);
    }
    currentY += podiumH;
  }

  // Linhas do ranking (restante)
  ctx.textBaseline = 'middle';
  rows.forEach((s, i) => {
    const x = 40;
    const w = W - 80;
    const cy = currentY + rowH / 2;

    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    roundRect(ctx, x, currentY, w, rowH, 18);
    ctx.fill();
    ctx.lineWidth = 1.5;
    
    if (i === 0) ctx.strokeStyle = 'rgba(205,127,50,0.5)'; // Bronze (3º lugar)
    else ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = i === 0 ? '#cd7f32' : 'rgba(255,255,255,0.6)';
    ctx.font = '900 32px Arial, sans-serif';
    ctx.fillText(`${i + 3}º`, x + 40, cy + 2);

    const avatar = avatars[i];
    if (avatar) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x + 100, cy, 24, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(avatar, x + 76, cy - 24, 48, 48);
      ctx.restore();
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.beginPath();
      ctx.arc(x + 100, cy, 24, 0, Math.PI * 2);
      ctx.fill();
    }

    const fire = fireCounts[s.participantId] || 0;
    let nameText = s.name;
    if (fire > 0) nameText += '  ' + '🔥'.repeat(Math.min(fire, 3)) + (fire > 3 ? ` x${fire}` : '');
    
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 34px Arial, sans-serif';
    ctx.fillText(nameText, x + 140, cy + 2);

    const change = rankChanges[s.participantId] || 0;
    const nameW = ctx.measureText(nameText).width;
    ctx.font = '900 20px Arial, sans-serif';
    if (change > 0) {
      ctx.fillStyle = '#4ade80';
      ctx.fillText(`▲${change}`, x + 140 + nameW + 12, cy - 12);
    } else if (change < 0) {
      ctx.fillStyle = '#f87171';
      ctx.fillText(`▼${Math.abs(change)}`, x + 140 + nameW + 12, cy - 12);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText(`-`, x + 140 + nameW + 12, cy - 12);
    }

    ctx.textAlign = 'right';
    ctx.fillStyle = i === 0 ? '#cd7f32' : 'rgba(255,255,255,0.9)'; // 3º -> bronze, resto -> branco
    ctx.font = '900 40px Arial, sans-serif';
    ctx.fillText(String(s.points), x + w - 78, cy + 2);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '700 22px Arial, sans-serif';
    ctx.fillText('PTS', x + w - 22, cy + 4);

    currentY += rowH + gap;
  });

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
