// ============================================================
// bracket-image — gera a imagem PNG do chaveamento (mata-mata) com a cara do
// app (paleta escura + dourado + bandeiras), pra enviar no grupo do WhatsApp.
// Monta um SVG à mão (bracket da esquerda p/ direita, conectores em cotovelo) e
// rasteriza com @resvg/resvg-js. Sem browser headless.
// ============================================================
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface BracketSlot {
  code: string; // sigla do time (ex.: BEL) ou '' se indefinido
  iso: string; // iso2 p/ a bandeira (ex.: 'be') ou '' se indefinido
  score: number | null;
  win: boolean; // avançou / venceu
}
export interface BracketMatch {
  home: BracketSlot;
  away: BracketSlot;
}
export interface BracketRound {
  label: string;
  matches: BracketMatch[]; // já na ordem da chave (pares alimentam o índice floor(i/2) da fase seguinte)
}

const COL = {
  bg: '#15110E',
  bg2: '#0d0b09',
  card: '#221a15',
  cardBorder: '#3a2f27',
  line: '#5a4a3d',
  gold: '#ffdf00',
  goldDim: '#f5b300',
  text: '#ffffff',
  textDim: '#9b8f85',
  green: '#009c3b',
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Baixa uma bandeira (flagcdn) e devolve como data URI base64. Cache por iso.
const flagCache = new Map<string, string | null>();
async function flagDataUri(iso: string): Promise<string | null> {
  if (!iso) return null;
  if (flagCache.has(iso)) return flagCache.get(iso) ?? null;
  try {
    const res = await fetch(`https://flagcdn.com/w40/${iso}.png`);
    if (!res.ok) throw new Error(String(res.status));
    const buf = Buffer.from(await res.arrayBuffer());
    const uri = `data:image/png;base64,${buf.toString('base64')}`;
    flagCache.set(iso, uri);
    return uri;
  } catch {
    flagCache.set(iso, null);
    return null;
  }
}

// Layout
const CARD_W = 188;
const CARD_H = 66;
const GAP_Y = 16;
const GAP_X = 44;
const PAD_L = 30;
const TITLE_H = 182; // altura reservada p/ título + linha + rótulos das colunas
const PAD_B = 60;

// Preenche uma vaga vazia com o classificado do jogo alimentador (quem venceu).
function fillFromFeeder(slot: BracketSlot, feeder: BracketMatch | undefined): void {
  if (!feeder || slot.code) return; // já tem time ou sem alimentador
  const adv = feeder.home.win ? feeder.home : feeder.away.win ? feeder.away : null;
  if (adv && adv.code) {
    slot.code = adv.code;
    slot.iso = adv.iso;
  }
}

export async function renderBracketPng(rounds: BracketRound[], fontBuffer: Buffer): Promise<Buffer> {
  // Propaga os classificados p/ as fases seguintes: se a vaga está indefinida
  // mas o jogo alimentador já tem vencedor, mostra quem avançou — mesmo que o
  // football-data ainda não tenha atribuído o time à vaga (lag da fonte).
  for (let c = 1; c < rounds.length; c++) {
    const prev = rounds[c - 1].matches;
    rounds[c].matches.forEach((m, j) => {
      fillFromFeeder(m.home, prev[2 * j]);
      fillFromFeeder(m.away, prev[2 * j + 1]);
    });
  }

  const nCols = rounds.length;
  const n0 = rounds[0]?.matches.length ?? 1;
  const contentH = n0 * CARD_H + (n0 - 1) * GAP_Y;
  const W = PAD_L * 2 + nCols * CARD_W + (nCols - 1) * GAP_X;
  const H = TITLE_H + contentH + PAD_B;

  // Pré-carrega as bandeiras (base64) de todos os slots.
  const isos = new Set<string>();
  for (const r of rounds) for (const m of r.matches) { if (m.home.iso) isos.add(m.home.iso); if (m.away.iso) isos.add(m.away.iso); }
  const flags = new Map<string, string | null>();
  await Promise.all([...isos].map(async (iso) => flags.set(iso, await flagDataUri(iso))));

  // Posições Y por rodada: a primeira distribui uniforme; as seguintes centram
  // no ponto médio dos dois filhos (par 2j / 2j+1) -> alinhamento de chave.
  const yById: number[][] = [];
  for (let c = 0; c < nCols; c++) {
    const ys: number[] = [];
    const matches = rounds[c].matches;
    for (let j = 0; j < matches.length; j++) {
      if (c === 0) {
        ys.push(TITLE_H + j * (CARD_H + GAP_Y) + CARD_H / 2);
      } else {
        const prev = yById[c - 1];
        const a = prev[2 * j] ?? prev[prev.length - 1];
        const b = prev[2 * j + 1] ?? a;
        ys.push((a + b) / 2);
      }
    }
    yById.push(ys);
  }

  const parts: string[] = [];
  parts.push(`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`);
  parts.push(`<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#221a15"/><stop offset="0.5" stop-color="${COL.bg}"/><stop offset="1" stop-color="${COL.bg2}"/></linearGradient>
    <linearGradient id="flag" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="${COL.green}"/><stop offset="0.5" stop-color="${COL.gold}"/><stop offset="1" stop-color="#002776"/></linearGradient></defs>`);
  parts.push(`<rect width="${W}" height="${H}" fill="url(#bg)"/>`);

  // Título + linha da bandeira (com folga acima dos rótulos das colunas)
  parts.push(`<text x="${W / 2}" y="88" font-family="Rama Gothic E" font-weight="bold" font-size="82" fill="${COL.gold}" text-anchor="middle" letter-spacing="2">CHAVEAMENTO</text>`);
  parts.push(`<rect x="${W / 2 - 140}" y="106" width="280" height="6" rx="3" fill="url(#flag)"/>`);

  // Conectores (cotovelo) entre colunas consecutivas
  for (let c = 0; c < nCols - 1; c++) {
    const x1 = PAD_L + c * (CARD_W + GAP_X) + CARD_W;
    const x2 = PAD_L + (c + 1) * (CARD_W + GAP_X);
    const midX = (x1 + x2) / 2;
    for (let j = 0; j < rounds[c].matches.length; j++) {
      const y1 = yById[c][j];
      const parent = Math.floor(j / 2);
      const y2 = yById[c + 1][parent] ?? y1;
      parts.push(`<path d="M ${x1} ${y1} H ${midX} V ${y2} H ${x2}" fill="none" stroke="${COL.line}" stroke-width="2"/>`);
    }
  }

  // Rótulos das colunas
  for (let c = 0; c < nCols; c++) {
    const cx = PAD_L + c * (CARD_W + GAP_X) + CARD_W / 2;
    parts.push(`<text x="${cx}" y="${TITLE_H - 18}" font-family="Rama Gothic E" font-weight="bold" font-size="24" fill="${COL.textDim}" text-anchor="middle" letter-spacing="1">${esc(rounds[c].label.toUpperCase())}</text>`);
  }

  // Cards
  const slotRow = (slot: BracketSlot, x: number, y: number): string => {
    const uri = slot.iso ? flags.get(slot.iso) : null;
    const nameColor = slot.code ? (slot.win ? COL.text : COL.textDim) : COL.textDim;
    const weight = slot.win ? 'bold' : 'normal';
    const flagEl = uri
      ? `<image href="${uri}" x="${x + 12}" y="${y - 9}" width="26" height="18" preserveAspectRatio="xMidYMid slice"/>`
      : `<rect x="${x + 12}" y="${y - 9}" width="26" height="18" rx="3" fill="#33291f"/>`;
    const scoreEl = slot.score != null
      ? `<text x="${x + CARD_W - 14}" y="${y + 6}" font-family="Rama Gothic E" font-weight="bold" font-size="24" fill="${slot.win ? COL.gold : COL.textDim}" text-anchor="end">${slot.score}</text>`
      : '';
    return `${flagEl}<text x="${x + 46}" y="${y + 6}" font-family="Rama Gothic E" font-weight="${weight}" font-size="22" fill="${nameColor}">${esc(slot.code || '—')}</text>${scoreEl}`;
  };

  for (let c = 0; c < nCols; c++) {
    const x = PAD_L + c * (CARD_W + GAP_X);
    for (let j = 0; j < rounds[c].matches.length; j++) {
      const m = rounds[c].matches[j];
      const cy = yById[c][j];
      const top = cy - CARD_H / 2;
      parts.push(`<rect x="${x}" y="${top}" width="${CARD_W}" height="${CARD_H}" rx="12" fill="${COL.card}" stroke="${COL.cardBorder}" stroke-width="1.5"/>`);
      parts.push(`<line x1="${x + 10}" y1="${cy}" x2="${x + CARD_W - 10}" y2="${cy}" stroke="${COL.cardBorder}" stroke-width="1"/>`);
      parts.push(slotRow(m.home, x, top + CARD_H / 4 + 2));
      parts.push(slotRow(m.away, x, top + (3 * CARD_H) / 4 - 2));
    }
  }

  parts.push(`<text x="${W - PAD_L}" y="${H - 22}" font-family="Rama Gothic E" font-weight="bold" font-size="20" fill="${COL.textDim}" text-anchor="end" letter-spacing="1">BANDIDOS APOSTADOS</text>`);
  parts.push('</svg>');

  const svg = parts.join('');
  // resvg-js (v2) carrega a fonte por caminho de arquivo — escrevemos o buffer
  // num temp (/tmp é gravável no Netlify) e apontamos via fontFiles.
  const fontPath = join(tmpdir(), 'bracket-rama.otf');
  writeFileSync(fontPath, fontBuffer);
  const resvg = new Resvg(svg, {
    font: { fontFiles: [fontPath], defaultFontFamily: 'Rama Gothic E', loadSystemFonts: false },
  });
  return Buffer.from(resvg.render().asPng());
}
