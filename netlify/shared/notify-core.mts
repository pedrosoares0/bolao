// ============================================================
// Notificações no grupo do WhatsApp via Evolution API.
//
// Como funciona: a cada sincronização, comparamos o estado ANTERIOR
// dos jogos (vindo do banco) com o estado NOVO (vindo da API) e, quando
// algo muda (jogo começou, mudou o placar, intervalo, fim), disparamos a
// mensagem no grupo. Eventos com horário (lembrete de 1h, ranking do dia)
// usam o relógio do servidor.
//
// Anti-duplicata: cada mensagem tem uma "chave" única gravada na tabela
// `sent_notifications`. Antes de enviar, reservamos a chave; se falhar o
// envio, liberamos a chave para tentar de novo no próximo ciclo.
//
// Env vars necessárias (Netlify):
//   EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE_NAME,
//   id_grupo (JID do grupo, ex.: 120363409600953192) e url_bolao.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type { EspnGoalDetail } from './espn-core.mts';
import { countScorerGoals, scorerName } from './scorer-core.mts';
// Só o TIPO no topo (não carrega o @resvg/resvg-js). O gerador é importado
// dinamicamente dentro de sendBracketImage, pra um erro de bundle da lib nativa
// não derrubar as outras notificações.
import type { BracketRound } from './bracket-image.mts';

// ---- Linha crua da tabela `matches` (o que sync-core monta) ----
interface MatchRow {
  id: number;
  utc_date: string;
  status: string;
  stage: string | null;
  group_name: string | null;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  home_pens?: number | null;
  away_pens?: number | null;
  home_score_90?: number | null; // placar do tempo normal (só prorrogação por gol)
  away_score_90?: number | null;
  winner?: string | null;
  duration?: string | null; // REGULAR | EXTRA_TIME | PENALTY_SHOOTOUT
  homeTeamId?: string;
  awayTeamId?: string;
  goalsDetail?: EspnGoalDetail[];
}

interface PrevState {
  id: number;
  status: string;
  home_score: number | null;
  away_score: number | null;
}

// ============================================================
// Formatação de times (PT + bandeira emoji)
// ============================================================

const teamNamesPt: { [k: string]: string } = {
  Algeria: 'Argélia', Argentina: 'Argentina', Australia: 'Austrália', Austria: 'Áustria',
  Belgium: 'Bélgica', 'Bosnia-Herzegovina': 'Bósnia', 'Bosnia and Herzegovina': 'Bósnia',
  Brazil: 'Brasil', Canada: 'Canadá', 'Cape Verde Islands': 'Cabo Verde', 'Cape Verde': 'Cabo Verde',
  Colombia: 'Colômbia', 'Congo DR': 'RD Congo', 'Democratic Republic of the Congo': 'RD Congo',
  Croatia: 'Croácia', 'Curaçao': 'Curaçao', Czechia: 'República Tcheca', 'Czech Republic': 'República Tcheca',
  Ecuador: 'Equador', Egypt: 'Egito', England: 'Inglaterra', France: 'França', Germany: 'Alemanha',
  Ghana: 'Gana', Haiti: 'Haiti', Iran: 'Irã', Iraq: 'Iraque', 'Ivory Coast': 'Costa do Marfim',
  Japan: 'Japão', Jordan: 'Jordânia', Mexico: 'México', Morocco: 'Marrocos', Netherlands: 'Holanda',
  'New Zealand': 'Nova Zelândia', Norway: 'Noruega', Panama: 'Panamá', Paraguay: 'Paraguai',
  Portugal: 'Portugal', Qatar: 'Catar', 'Saudi Arabia': 'Arábia Saudita', Scotland: 'Escócia',
  Senegal: 'Senegal', 'South Africa': 'África do Sul', 'South Korea': 'Coreia do Sul', Spain: 'Espanha',
  Sweden: 'Suécia', Switzerland: 'Suíça', Tunisia: 'Tunísia', Turkey: 'Turquia',
  'United States': 'EUA', Uruguay: 'Uruguai', Uzbekistan: 'Uzbequistão',
};

const iso2Map: { [k: string]: string } = {
  Algeria: 'dz', Argentina: 'ar', Australia: 'au', Austria: 'at', Belgium: 'be',
  'Bosnia-Herzegovina': 'ba', 'Bosnia and Herzegovina': 'ba', Brazil: 'br', Canada: 'ca',
  'Cape Verde Islands': 'cv', 'Cape Verde': 'cv', Colombia: 'co', 'Congo DR': 'cd',
  Croatia: 'hr', 'Curaçao': 'cw', Czechia: 'cz', 'Czech Republic': 'cz', Ecuador: 'ec',
  Egypt: 'eg', England: 'gb-eng', France: 'fr', Germany: 'de', Ghana: 'gh', Haiti: 'ht',
  Iran: 'ir', Iraq: 'iq', 'Ivory Coast': 'ci', Japan: 'jp', Jordan: 'jo', Mexico: 'mx',
  Morocco: 'ma', Netherlands: 'nl', 'New Zealand': 'nz', Norway: 'no', Panama: 'pa',
  Paraguay: 'py', Portugal: 'pt', Qatar: 'qa', 'Saudi Arabia': 'sa', Scotland: 'gb-sct',
  Senegal: 'sn', 'South Africa': 'za', 'South Korea': 'kr', Spain: 'es', Sweden: 'se',
  Switzerland: 'ch', Tunisia: 'tn', Turkey: 'tr', 'United States': 'us', Uruguay: 'uy',
  Uzbekistan: 'uz',
};

const stagePt: { [k: string]: string } = {
  GROUP_STAGE: 'Fase de Grupos', LAST_32: '16 avos de Final', LAST_16: 'Oitavas de Final',
  QUARTER_FINALS: 'Quartas de Final', SEMI_FINALS: 'Semifinal', THIRD_PLACE: 'Disputa do 3º Lugar',
  FINAL: 'Final',
};

// Bandeira em emoji a partir do nome em inglês. Inglaterra e Escócia usam
// sequências especiais; o resto vira par de "regional indicators" do ISO2.
export const flagEmoji = (nameEn: string): string => {
  const iso = iso2Map[nameEn];
  if (!iso) return '🏳️';
  if (iso === 'gb-eng') return String.fromCodePoint(0x1f3f4, 0xe0067, 0xe0062, 0xe0065, 0xe006e, 0xe0067, 0xe007f);
  if (iso === 'gb-sct') return String.fromCodePoint(0x1f3f4, 0xe0067, 0xe0062, 0xe0073, 0xe0063, 0xe0074, 0xe007f);
  if (iso.length !== 2) return '🏳️';
  const A = 0x1f1e6;
  return (
    String.fromCodePoint(A + iso.charCodeAt(0) - 97) +
    String.fromCodePoint(A + iso.charCodeAt(1) - 97)
  );
};

export const ptName = (nameEn: string): string => teamNamesPt[nameEn] || nameEn;
const teamLabel = (nameEn: string): string => `${flagEmoji(nameEn)} ${ptName(nameEn)}`;

const groupLabel = (stage: string | null, group: string | null): string => {
  if (group) return `Grupo ${group.replace('GROUP_', '').replace('Group ', '')}`;
  return stagePt[stage || ''] || 'Copa 2026';
};

// Linha de placar padrão: 🇧🇷 Brasil  2 x 0  Sérvia 🇷🇸
const scoreLine = (m: MatchRow): string => {
  const h = m.home_score ?? 0;
  const a = m.away_score ?? 0;
  return `${flagEmoji(m.home_team)} *${ptName(m.home_team)}*  ${h} x ${a}  *${ptName(m.away_team)}* ${flagEmoji(m.away_team)}`;
};

// Linha extra do mata-mata quando o jogo passou dos 90': pênaltis ou prorrogação.
// Devolve null no tempo normal. Detecta pênaltis pelos gols da disputa (vêm tanto
// da ESPN quanto da football-data); prorrogação pela duração (só football-data).
// O time que avança é deduzido (winner, ou o placar dos pênaltis se ainda não veio).
const decisionLine = (m: MatchRow): string | null => {
  const side = koWinnerSide(m);
  const advEn = side === 'HOME' ? m.home_team : side === 'AWAY' ? m.away_team : null;
  const adv = advEn ? ` — *${ptName(advEn)}* se classifica` : '';

  // Pênaltis: o placar principal é o tempo normal (empate); aqui vai a disputa.
  if (m.home_pens != null && m.away_pens != null) {
    return `🥅 *Pênaltis:* ${flagEmoji(m.home_team)} ${m.home_pens} x ${m.away_pens} ${flagEmoji(m.away_team)}${adv}`;
  }
  // Prorrogação decidida por gol: o placar principal (scoreLine) já é o final.
  // Aqui destacamos que foi na prorrogação e como estava aos 90'.
  if (m.duration === 'EXTRA_TIME') {
    const has90 = m.home_score_90 != null && m.away_score_90 != null;
    const base = has90
      ? `⏱️ *Prorrogação* — aos 90' estava ${flagEmoji(m.home_team)} ${m.home_score_90} x ${m.away_score_90} ${flagEmoji(m.away_team)}`
      : '⏱️ *Decidido na prorrogação*';
    return `${base}${adv}`;
  }
  return null;
};

// ============================================================
// Datas/horas no fuso de Brasília
// ============================================================

const isoFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
const dmFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
const timeFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false });

const hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23' });

const isoDateOf = (utc: string) => isoFmt.format(new Date(utc));
const dmLabelOf = (utc: string) => dmFmt.format(new Date(utc));
const timeOf = (utc: string) => timeFmt.format(new Date(utc));
// Jogo de madrugada (kickoff entre 00h e 08h de Brasília)
const isMadrugada = (utc: string) => parseInt(hourFmt.format(new Date(utc)), 10) < 8;
// "2026-06-17" -> "17/06"
const dmFromIso = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

// ============================================================
// Pontuação (espelha src/utils/rules.ts)
// ============================================================

type ResultType = 'exact' | 'draw' | 'winner' | 'wrong' | 'pending';
interface BetRow {
  user_id: string;
  match_id?: number;
  home_score: number;
  away_score: number;
  scorer_id?: string | null;
  pens_pick?: boolean | null;
  pens_winner?: 'HOME' | 'AWAY' | null;
}

// Quem avançou de fase. Usa `winner` (football-data); se ainda não veio (ex.: o
// sync AO VIVO da ESPN marcou o fim antes do football-data), cai no placar dos
// pênaltis e, por fim, no placar (prorrogação por gol). null = não dá pra saber
// (ex.: empate de fase de grupos, que não tem quem avança).
const koWinnerSide = (m: MatchRow): 'HOME' | 'AWAY' | null => {
  if (m.winner === 'HOME_TEAM') return 'HOME';
  if (m.winner === 'AWAY_TEAM') return 'AWAY';
  if (m.home_pens != null && m.away_pens != null) return m.home_pens > m.away_pens ? 'HOME' : 'AWAY';
  if (m.home_score != null && m.away_score != null && m.home_score !== m.away_score) {
    return m.home_score > m.away_score ? 'HOME' : 'AWAY';
  }
  return null;
};

const analyze = (bet: BetRow | undefined, m: MatchRow): { points: number; type: ResultType } => {
  if (!bet || m.home_score === null || m.away_score === null) return { points: 0, type: 'pending' };
  const bH = bet.home_score, bA = bet.away_score, mH = m.home_score, mA = m.away_score;
  if (bH === mH && bA === mA) return { points: 3, type: 'exact' };
  if (mH === mA && bH === bA) return { points: 2, type: 'draw' };
  // Mata-mata de placar empatado (pênaltis): quem cravou no placar o time que
  // AVANÇOU leva 1; quem apostou o eliminado, 0. (Grupo: koSide = null.)
  if (mH === mA) {
    const koSide = koWinnerSide(m);
    if (koSide) {
      const advance = koSide === 'HOME' ? 1 : -1;
      return Math.sign(bH - bA) === advance ? { points: 1, type: 'winner' } : { points: 0, type: 'wrong' };
    }
  }
  if (Math.sign(mH - mA) === Math.sign(bH - bA)) return { points: 1, type: 'winner' };
  return { points: 0, type: 'wrong' };
};

// Bônus do palpite de classificação (espelha rules.pensBonus): só quando o
// usuário apostou empate e o jogo passou dos 90' (prorrogação ou pênaltis).
// +1 acertar a forma, +1/−1 quem avança. Fora dos 90' (ou fase de grupos, que
// nunca passa dos 90') dá 0 — então não precisa do `stage`, que às vezes não
// vem no objeto do sync ao vivo.
const pensBonusN = (bet: BetRow | undefined, m: MatchRow): number => {
  if (!bet) return 0;
  if (m.status !== 'FINISHED') return 0;
  if (m.home_score === null || m.away_score === null) return 0;
  if (bet.home_score !== bet.away_score) return 0;

  const duration = m.duration
    ?? (m.home_pens != null && m.away_pens != null ? 'PENALTY_SHOOTOUT' : null);
  const wasPens = duration === 'PENALTY_SHOOTOUT';
  const wentBeyond90 = wasPens || duration === 'EXTRA_TIME';
  if (!wentBeyond90) return 0;

  const winnerSide = koWinnerSide(m);
  if (!winnerSide) return 0;

  let points = 0;
  if ((bet.pens_pick ?? false) === wasPens) points += 1;
  if ((bet.pens_winner ?? null) === winnerSide) points += 1;
  else points -= 1;
  return points;
};

const typeLabel: { [k in ResultType]?: string } = {
  exact: 'placar exato!',
  draw: 'empate certo',
  winner: 'vencedor',
};

// ============================================================
// Envio (Evolution API) + anti-duplicata
// ============================================================

const evolutionConfigured = (): boolean =>
  !!(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY &&
     process.env.EVOLUTION_INSTANCE_NAME && (process.env.id_grupo || process.env.ID_GRUPO));

export const sendText = async (text: string): Promise<boolean> => {
  const base = (process.env.EVOLUTION_API_URL || '').replace(/\/+$/, '');
  const key = process.env.EVOLUTION_API_KEY || '';
  const instance = process.env.EVOLUTION_INSTANCE_NAME || '';
  const group = process.env.id_grupo || process.env.ID_GRUPO || '';
  const number = group.includes('@') ? group : `${group}@g.us`;
  const endpoint = `${base}/message/sendText/${instance}`;
  const headers = { 'Content-Type': 'application/json', apikey: key };

  // Evolution v2: { number, text }
  try {
    const res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ number, text }) });
    if (res.ok) return true;
    // Evolution v1 (fallback): { number, textMessage: { text } }
    const res1 = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ number, textMessage: { text } }) });
    if (res1.ok) return true;
    console.error('Evolution falhou:', res.status, await res.text().catch(() => ''));
    return false;
  } catch (err) {
    console.error('Evolution erro de rede:', err);
    return false;
  }
};

// Envia uma IMAGEM (base64) pro grupo, com legenda. Espelha o sendText (v2 e
// fallback v1). `media` = base64 puro (sem o prefixo data:).
export const sendMedia = async (base64: string, caption: string, fileName = 'imagem.png'): Promise<boolean> => {
  const base = (process.env.EVOLUTION_API_URL || '').replace(/\/+$/, '');
  const key = process.env.EVOLUTION_API_KEY || '';
  const instance = process.env.EVOLUTION_INSTANCE_NAME || '';
  const group = process.env.id_grupo || process.env.ID_GRUPO || '';
  const number = group.includes('@') ? group : `${group}@g.us`;
  const endpoint = `${base}/message/sendMedia/${instance}`;
  const headers = { 'Content-Type': 'application/json', apikey: key };

  try {
    // Evolution v2
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ number, mediatype: 'image', mimetype: 'image/png', media: base64, fileName, caption }),
    });
    if (res.ok) return true;
    // Evolution v1 (fallback)
    const res1 = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ number, mediaMessage: { mediatype: 'image', fileName, caption, media: base64 } }),
    });
    if (res1.ok) return true;
    console.error('Evolution sendMedia falhou:', res.status, await res.text().catch(() => ''));
    return false;
  } catch (err) {
    console.error('Evolution sendMedia erro de rede:', err);
    return false;
  }
};

// Reserva atômica da chave (insere; true se foi NOVA, false se já existia
// ou se a tabela não existe — nesse caso não enviamos para evitar repetição).
const reserve = async (supabase: SupabaseClient, key: string): Promise<boolean> => {
  const { data, error } = await supabase
    .from('sent_notifications')
    .upsert({ dedup_key: key }, { onConflict: 'dedup_key', ignoreDuplicates: true })
    .select();
  if (error) {
    console.error('sent_notifications indisponível:', error.message);
    return false;
  }
  return Array.isArray(data) && data.length > 0;
};

const release = async (supabase: SupabaseClient, key: string): Promise<void> => {
  await supabase.from('sent_notifications').delete().eq('dedup_key', key);
};

// Envia só se a chave for nova; se o envio falhar, libera a chave p/ retry.
const sendOnce = async (supabase: SupabaseClient, key: string, text: string): Promise<void> => {
  if (!(await reserve(supabase, key))) return;
  const ok = await sendText(text);
  if (!ok) await release(supabase, key);
};

// ============================================================
// Mensagens
// ============================================================

const url = () => process.env.url_bolao || process.env.URL_BOLAO || 'https://bandidosapostados.netlify.app/';

// Só é enviado quando há gente sem palpitar (ver runNotifications)
const msgReminder = (m: MatchRow, missing: string[]): string =>
  [
    '⏰ *FALTA ~1 HORA!*',
    '',
    `O palpite de ${teamLabel(m.home_team)} x ${teamLabel(m.away_team)} fecha às *${timeOf(m.utc_date)}*.`,
    '',
    `❌ Ainda não palpitaram: *${missing.join(', ')}*`,
    `👉 ${url()}`,
  ].join('\n');

const msgStarted = (m: MatchRow): string =>
  [
    '🟢 *COMEÇOU!*',
    '',
    scoreLine(m),
    `🏟️ ${groupLabel(m.stage, m.group_name)}`,
    '',
    'Palpites encerrados. Boa sorte! 🍀',
  ].join('\n');

const msgGoal = (m: MatchRow, sideTeamEn: string, goalInfo?: EspnGoalDetail): string => {
  const lines = [
    `⚽ *GOOOOL!* ${flagEmoji(sideTeamEn)} *${ptName(sideTeamEn).toUpperCase()}*`
  ];
  if (goalInfo) {
    lines.push(`🥅 *${goalInfo.scorer}* (${goalInfo.minute})${goalInfo.ownGoal ? ' (Contra)' : ''}`);
  }
  lines.push('');
  lines.push(scoreLine(m));
  return lines.join('\n');
};

const msgGoalAnnulled = (m: MatchRow, sideTeamEn: string): string =>
  [
    `🚫 *GOL ANULADO!* ${flagEmoji(sideTeamEn)} *${ptName(sideTeamEn).toUpperCase()}*`,
    '',
    scoreLine(m),
  ].join('\n');

interface ScorerLine {
  name: string;
  points: number;      // pontos do PLACAR
  type: ResultType;
  pensPts: number;     // bônus de classificação (mata-mata): +1 forma, +1/−1 quem avança
  scorerGoals: number; // gols do artilheiro escolhido (+1 cada)
  scorerLabel: string | null; // nome do artilheiro escolhido
  total: number;       // placar + classificação + artilheiro
}

const msgEnd = (m: MatchRow, scorers: ScorerLine[]): string => {
  const lineFor = (s: ScorerLine): string => {
    const partes: string[] = [];
    if (s.points > 0) partes.push(`${typeLabel[s.type] || ''} +${s.points}`);
    if (s.pensPts !== 0) partes.push(`🏆 classificação ${s.pensPts > 0 ? '+' : ''}${s.pensPts}`);
    if (s.scorerGoals > 0) {
      const golTxt = s.scorerGoals === 1 ? 'gol' : 'gols';
      partes.push(`⚽ ${s.scorerLabel ?? 'artilheiro'} ${s.scorerGoals} ${golTxt} +${s.scorerGoals}`);
    }
    return `• *${s.name}*  +${s.total}  (${partes.join(', ')})`;
  };
  const bloco = scorers.length
    ? ['🎯 *Pontuou nesse jogo:*', ...scorers.map(lineFor)].join('\n')
    : '😬 Ninguém pontuou nesse jogo.';
  // Linha de placar + (se houve) a linha de pênaltis/prorrogação, antes do bloco.
  // Nos pênaltis, o placar principal é o tempo normal (empate) — deixamos explícito.
  const decision = decisionLine(m);
  const isPens = m.home_pens != null && m.away_pens != null;
  const placarLinha = isPens ? `${scoreLine(m)}  _(tempo normal)_` : scoreLine(m);
  const cabecalho = decision
    ? ['🔴 *FIM DE JOGO*', '', placarLinha, decision]
    : ['🔴 *FIM DE JOGO*', '', placarLinha];
  return [...cabecalho, '', bloco].join('\n');
};

// Campeão de um Desafio dos Molhados (anunciado no fim do jogo).
const msgChallengeWin = (winnerName: string, loserName: string, advTeamEn: string): string => [
  '🏆 *CAMPEÃO DO DESAFIO DOS MOLHADOS* 🌊',
  '',
  `${flagEmoji(advTeamEn)} *${ptName(advTeamEn)}* avançou!`,
  `*${winnerName}* venceu *${loserName}* e leva +1 ponto. 💧`,
].join('\n');

const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣'];

const msgDayFinal = (
  dayLabel: string,
  dayScores: { name: string; points: number }[],
  general: { name: string; points: number }[]
): string => {
  const rodada = dayScores.map((s, i) => `${medals[i] || `${i + 1}.`} *${s.name}*  +${s.points}`).join('\n');
  const geral = general.map((s, i) => `${i + 1}. *${s.name}*  ${s.points} pts`).join('\n');
  return [
    `🏁 *PONTUAÇÃO FINAL — ${dayLabel}*`,
    '',
    '📊 *Pontos da rodada:*',
    rodada,
    '',
    '🏆 *Ranking geral:*',
    geral,
  ].join('\n');
};

// Prévia dos jogos do dia seguinte (enviada 30 min após a pontuação final).
// Jogos de madrugada (00h-08h) ganham 🌙 — apesar de poderem ser apostados
// um dia antes, no resumo aparecem na próxima rodada (são do dia seguinte).
const msgNextRound = (iso: string, matches: MatchRow[]): string => {
  const linhas = matches.map(
    (m) => `${isMadrugada(m.utc_date) ? '🌙 ' : ''}${teamLabel(m.home_team)} x ${teamLabel(m.away_team)} — *${timeOf(m.utc_date)}*`
  );
  return [
    `📅 *PRÓXIMA RODADA — ${dmFromIso(iso)}*`,
    '',
    ...linhas,
    '',
    '⏰ Já deixe seus palpites prontos!',
    `👉 ${url()}`,
  ].join('\n');
};

// ============================================================
// Motor de notificações
// ============================================================

const isPre = (s: string) => s === 'SCHEDULED' || s === 'TIMED';
const isLive = (s: string) => s === 'IN_PLAY' || s === 'PAUSED';

// ============================================================
// Imagem do CHAVEAMENTO pro grupo (fim de dia no mata-mata)
// ============================================================

// Ordem oficial da chave por id (football-data) — igual ao BracketTab. Garante
// que os pares 2k/2k+1 alimentem o índice k da fase seguinte (conectores certos).
const BRACKET_ORDER: Record<string, string[]> = {
  LAST_32: ['537415','537416','537417','537418','537419','537420','537421','537422','537423','537424','537425','537426','537427','537428','537429','537430'],
  LAST_16: ['537375','537376','537379','537380','537377','537378','537381','537382'],
  QUARTER_FINALS: ['537383','537384','537385','537386'],
  SEMI_FINALS: ['537387','537388'],
  FINAL: ['537390'],
};
const KO_TREE = ['LAST_32', 'LAST_16', 'QUARTER_FINALS', 'SEMI_FINALS', 'FINAL'];
const KO_LABEL: Record<string, string> = {
  LAST_32: '16avos', LAST_16: 'Oitavas', QUARTER_FINALS: 'Quartas', SEMI_FINALS: 'Semis', FINAL: 'Final',
};

interface KoRow {
  id: number; stage: string | null; utc_date: string;
  home_team: string; away_team: string; home_tla: string | null; away_tla: string | null;
  home_score: number | null; away_score: number | null;
  winner: string | null; home_pens: number | null; away_pens: number | null;
}

// Fonte Rama Gothic (display do app) — buscada do site publicado e cacheada.
let ramaFontCache: Buffer | null = null;
async function getRamaFont(): Promise<Buffer | null> {
  if (ramaFontCache) return ramaFontCache;
  const url = process.env.URL || process.env.DEPLOY_PRIME_URL;
  if (!url) return null;
  try {
    const res = await fetch(`${url}/fonnts.com-Rama_Gothic_E_Bold.otf`);
    if (!res.ok) return null;
    ramaFontCache = Buffer.from(await res.arrayBuffer());
    return ramaFontCache;
  } catch {
    return null;
  }
}

const isTbdTeam = (t: string) => !t || t === 'A definir';
const abbr3 = (t: string) => (t || '').replace(/[^A-Za-zÀ-ÿ]/g, '').slice(0, 3).toUpperCase();

// Gera e envia a imagem do chaveamento. Devolve false se não deu (sem mata-mata,
// sem fonte, envio falhou) — aí o chamador libera a chave pra tentar de novo.
async function sendBracketImage(supabase: SupabaseClient, caption: string): Promise<boolean> {
  const font = await getRamaFont();
  if (!font) {
    console.warn('bracket: fonte indisponível');
    return false;
  }
  const { data } = await supabase
    .from('matches')
    .select('id, stage, utc_date, home_team, away_team, home_tla, away_tla, home_score, away_score, winner, home_pens, away_pens')
    .in('stage', KO_TREE);
  const all = (data ?? []) as KoRow[];
  if (all.length === 0) return false; // mata-mata ainda não começou

  const rounds: BracketRound[] = [];
  for (const stage of KO_TREE) {
    const ms = all.filter((m) => m.stage === stage);
    if (ms.length === 0) continue;
    const order = BRACKET_ORDER[stage] || [];
    ms.sort((a, b) => {
      const ia = order.indexOf(String(a.id));
      const ib = order.indexOf(String(b.id));
      if (ia >= 0 && ib >= 0) return ia - ib;
      return Date.parse(a.utc_date) - Date.parse(b.utc_date);
    });
    rounds.push({
      label: KO_LABEL[stage] ?? stage,
      matches: ms.map((m) => {
        const w = koWinnerSide(m as unknown as MatchRow);
        const slot = (team: string, tla: string | null, score: number | null, side: 'HOME' | 'AWAY') => ({
          code: isTbdTeam(team) ? '' : (tla || abbr3(team)),
          iso: isTbdTeam(team) ? '' : (iso2Map[team] || ''),
          score,
          win: w === side,
        });
        return {
          home: slot(m.home_team, m.home_tla, m.home_score, 'HOME'),
          away: slot(m.away_team, m.away_tla, m.away_score, 'AWAY'),
        };
      }),
    });
  }
  if (rounds.length === 0) return false;

  // Import dinâmico: carrega o @resvg/resvg-js só aqui (ver comentário no topo).
  const { renderBracketPng } = await import('./bracket-image.mts');
  const png = await renderBracketPng(rounds, font);
  return sendMedia(png.toString('base64'), caption, 'chaveamento.png');
}

export async function runNotifications(
  supabase: SupabaseClient,
  prevById: Map<number, PrevState>,
  rows: MatchRow[]
): Promise<void> {
  if (!evolutionConfigured()) {
    console.warn('Evolution API não configurada — notificações desligadas.');
    return;
  }

  // Participantes (uid -> nome) — usados em vários lugares
  const { data: parts } = await supabase.from('participants').select('id, name').order('name');
  const participants: { id: string; name: string }[] = parts ?? [];
  const nameByUid = new Map(participants.map((p) => [p.id, p.name]));

  const now = Date.now();

  // ---- 1. Lembrete de ~1h antes do fechamento do palpite ----
  //   Só envia se AINDA HÁ gente sem palpitar. Se todos já apostaram, não manda.
  for (const m of rows) {
    if (!isPre(m.status)) continue;
    const mins = (Date.parse(m.utc_date) - now) / 60000;
    if (mins <= 0 || mins > 60) continue;
    // quem ainda não palpitou NESTE jogo
    const { data: betRows } = await supabase.from('bets').select('user_id').eq('match_id', m.id);
    const apostaram = new Set(((betRows ?? []) as { user_id: string }[]).map((b) => b.user_id));
    const missing = participants.filter((p) => !apostaram.has(p.id)).map((p) => p.name);
    if (missing.length === 0) continue; // todos já palpitaram → não envia lembrete
    const key = `pre60:${m.id}`;
    if (!(await reserve(supabase, key))) continue;
    const ok = await sendText(msgReminder(m, missing));
    if (!ok) await release(supabase, key);
  }

  // ---- 2. Transições de estado (começou / gol / intervalo / fim) ----
  const finishedDatesTouched = new Set<string>();

  for (const m of rows) {
    const prev = prevById.get(m.id);
    if (!prev) continue; // sem estado anterior: não inventa evento (evita backfill)

    // começou
    if (isPre(prev.status) && m.status === 'IN_PLAY') {
      await sendOnce(supabase, `start:${m.id}`, msgStarted(m));
    }

    // gol / gol anulado (placar mudou enquanto ao vivo)
    if (isLive(m.status) && m.home_score !== null && m.away_score !== null) {
      const ph = prev.home_score ?? 0;
      const pa = prev.away_score ?? 0;

      // --- GOL: placar subiu ---
      if (m.home_score > ph) {
        const homeGoals = (m.goalsDetail || []).filter(
          (g) => (g.teamId === m.homeTeamId && !g.ownGoal) || (g.teamId === m.awayTeamId && g.ownGoal)
        );
        const goalInfo = homeGoals[m.home_score - 1];
        // libera um eventual "anulado" desse placar (caso ESTE gol seja anulado depois)
        await release(supabase, `goalvar:${m.id}:H:${m.home_score}`);
        await sendOnce(supabase, `goal:${m.id}:H:${m.home_score}`, msgGoal(m, m.home_team, goalInfo));
      }
      if (m.away_score > pa) {
        const awayGoals = (m.goalsDetail || []).filter(
          (g) => (g.teamId === m.awayTeamId && !g.ownGoal) || (g.teamId === m.homeTeamId && g.ownGoal)
        );
        const goalInfo = awayGoals[m.away_score - 1];
        await release(supabase, `goalvar:${m.id}:A:${m.away_score}`);
        await sendOnce(supabase, `goal:${m.id}:A:${m.away_score}`, msgGoal(m, m.away_team, goalInfo));
      }

      // --- GOL ANULADO (VAR): placar caiu enquanto ao vivo ---
      // Libera os gols desfeitos para que um gol REAL futuro no mesmo placar
      // volte a notificar (sem o dedup engolir), e avisa a anulação uma vez.
      if (m.home_score < ph) {
        for (let s = m.home_score + 1; s <= ph; s++) {
          await release(supabase, `goal:${m.id}:H:${s}`);
        }
        await sendOnce(supabase, `goalvar:${m.id}:H:${ph}`, msgGoalAnnulled(m, m.home_team));
      }
      if (m.away_score < pa) {
        for (let s = m.away_score + 1; s <= pa; s++) {
          await release(supabase, `goal:${m.id}:A:${s}`);
        }
        await sendOnce(supabase, `goalvar:${m.id}:A:${pa}`, msgGoalAnnulled(m, m.away_team));
      }
    }

    // fim de jogo
    if (m.status === 'FINISHED' && prev.status !== 'FINISHED') {
      const { data: betRows } = await supabase
        .from('bets')
        .select('user_id, home_score, away_score, scorer_id, pens_pick, pens_winner')
        .eq('match_id', m.id);
      const scorers = ((betRows ?? []) as BetRow[])
        .map((b) => {
          const a = analyze(b, m);
          const pensPts = pensBonusN(b, m);
          // Bônus do artilheiro: +1 por gol do jogador escolhido (jogos do Brasil).
          const scorerGoals = countScorerGoals(m.goalsDetail, b.scorer_id);
          return {
            name: nameByUid.get(b.user_id) || '??',
            points: a.points,
            type: a.type,
            pensPts,
            scorerGoals,
            scorerLabel: scorerGoals > 0 ? scorerName(b.scorer_id) : null,
            total: a.points + pensPts + scorerGoals,
          };
        })
        .filter((s) => s.total > 0)
        .sort((a, b) => b.total - a.total);
      await sendOnce(supabase, `end:${m.id}`, msgEnd(m, scorers));

      // Desafio dos Molhados: anuncia o campeão de cada desafio do jogo.
      const adv: 'HOME' | 'AWAY' | null = m.winner === 'HOME_TEAM' ? 'HOME' : m.winner === 'AWAY_TEAM' ? 'AWAY' : null;
      if (adv) {
        const { data: chs } = await supabase
          .from('challenges')
          .select('id, challenger_id, challenged_id, challenger_pick')
          .eq('match_id', m.id)
          .eq('status', 'accepted');
        for (const ch of (chs ?? []) as { id: string; challenger_id: string; challenged_id: string; challenger_pick: string }[]) {
          const winnerUid = ch.challenger_pick === adv ? ch.challenger_id : ch.challenged_id;
          const loserUid = winnerUid === ch.challenger_id ? ch.challenged_id : ch.challenger_id;
          const advTeam = adv === 'HOME' ? m.home_team : m.away_team;
          await sendOnce(supabase, `challwin:${ch.id}`,
            msgChallengeWin(nameByUid.get(winnerUid) || '??', nameByUid.get(loserUid) || '??', advTeam));
        }
      }

      finishedDatesTouched.add(isoDateOf(m.utc_date));
    }
  }

  // ---- 3. Pontuação final do dia (quando o último jogo do dia acaba) ----
  for (const iso of finishedDatesTouched) {
    const dayMatches = rows.filter((r) => isoDateOf(r.utc_date) === iso);
    const allDone = dayMatches.length > 0 && dayMatches.every((r) => r.status === 'FINISHED');
    if (!allDone) continue;
    const key = `dayfinal:${iso}`;
    if (!(await reserve(supabase, key))) continue;

    // todas as apostas (para somar rodada + geral) — inclui o artilheiro escolhido
    const { data: allBets } = await supabase.from('bets').select('user_id, match_id, home_score, away_score, scorer_id, pens_pick, pens_winner');
    const betsByKey = new Map<string, BetRow>();
    ((allBets ?? []) as BetRow[]).forEach((b) => betsByKey.set(`${b.user_id}_${b.match_id}`, b));

    const finishedAll = rows.filter((r) => r.status === 'FINISHED');

    // Gols de cada jogo (persistidos em matches.goals) para o bônus de artilheiro.
    // Buscamos do banco: os `rows` deste ciclo só trazem goalsDetail dos jogos que
    // a ESPN tocou agora — a pontuação geral precisa de todos os jogos encerrados.
    const { data: goalRows } = await supabase
      .from('matches')
      .select('id, goals')
      .in('id', finishedAll.map((r) => r.id));
    const goalsByMatch = new Map<number, { scorer: string; ownGoal?: boolean }[]>();
    ((goalRows ?? []) as { id: number; goals: { scorer: string; ownGoal?: boolean }[] | null }[])
      .forEach((g) => goalsByMatch.set(g.id, g.goals ?? []));

    // Total = pontos do placar + bônus de artilheiro (+1 por gol). Some o saldo;
    // a mensagem mostra só o total final, sem separar o bônus.
    const sumFor = (uid: string, matches: MatchRow[]) =>
      matches.reduce((acc, mm) => {
        const bet = betsByKey.get(`${uid}_${mm.id}`);
        const placar = analyze(bet, mm).points;
        const pens = pensBonusN(bet, mm);
        const bonus = countScorerGoals(goalsByMatch.get(mm.id), bet?.scorer_id);
        return acc + placar + pens + bonus;
      }, 0);

    const dayScores = participants
      .map((p) => ({ name: p.name, points: sumFor(p.id, dayMatches) }))
      .sort((a, b) => b.points - a.points);
    const general = participants
      .map((p) => ({ name: p.name, points: sumFor(p.id, finishedAll) }))
      .sort((a, b) => b.points - a.points);

    const ok = await sendText(msgDayFinal(dmLabelOf(dayMatches[0].utc_date), dayScores, general));
    if (!ok) await release(supabase, key);
  }

  // ---- 4. Prévia da PRÓXIMA RODADA (30 min após a pontuação final do dia) ----
  //   Listamos os jogos do próximo dia de CALENDÁRIO com jogos — incluindo os de
  //   madrugada (00h-08h), que fisicamente são do dia seguinte.
  const THIRTY_MIN = 30 * 60 * 1000;
  const SIX_HOURS = 6 * 60 * 60 * 1000; // janela p/ evitar backfill em deploy
  const { data: dayFinals } = await supabase
    .from('sent_notifications')
    .select('dedup_key, sent_at')
    .like('dedup_key', 'dayfinal:%');

  for (const df of (dayFinals ?? []) as { dedup_key: string; sent_at: string }[]) {
    const sentMs = Date.parse(df.sent_at);
    const elapsed = now - sentMs;
    if (elapsed < THIRTY_MIN || elapsed > SIX_HOURS) continue; // cedo demais ou antigo demais

    const dayIso = df.dedup_key.slice('dayfinal:'.length);
    const nextIso = rows
      .map((r) => isoDateOf(r.utc_date))
      .filter((iso) => iso > dayIso)
      .sort()[0];
    if (!nextIso) continue;

    const key = `nextround:${dayIso}`;
    if (!(await reserve(supabase, key))) continue;

    const nextMatches = rows
      .filter((r) => isoDateOf(r.utc_date) === nextIso)
      .sort((a, b) => Date.parse(a.utc_date) - Date.parse(b.utc_date));
    const ok = await sendText(msgNextRound(nextIso, nextMatches));
    if (!ok) await release(supabase, key);

    // ÚLTIMA mensagem do dia: a imagem do CHAVEAMENTO atualizado (só no
    // mata-mata), logo após a prévia da próxima rodada. Chave própria; se o
    // mata-mata ainda não começou, libera pra tentar de novo no dia seguinte.
    const brKey = `bracket:${dayIso}`;
    if (await reserve(supabase, brKey)) {
      try {
        const sent = await sendBracketImage(supabase, `🏆 *Chaveamento* atualizado — ${dmFromIso(dayIso)}`);
        if (!sent) await release(supabase, brKey);
      } catch (err) {
        console.error('Falha ao enviar o chaveamento:', err);
        await release(supabase, brKey);
      }
    }
  }
}
