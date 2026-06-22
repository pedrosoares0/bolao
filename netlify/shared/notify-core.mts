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
const flagEmoji = (nameEn: string): string => {
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

const ptName = (nameEn: string): string => teamNamesPt[nameEn] || nameEn;
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
interface BetRow { user_id: string; match_id?: number; home_score: number; away_score: number; scorer_id?: string | null; }

const analyze = (bet: BetRow | undefined, m: MatchRow): { points: number; type: ResultType } => {
  if (!bet || m.home_score === null || m.away_score === null) return { points: 0, type: 'pending' };
  const bH = bet.home_score, bA = bet.away_score, mH = m.home_score, mA = m.away_score;
  if (bH === mH && bA === mA) return { points: 3, type: 'exact' };
  if (mH === mA && bH === bA) return { points: 2, type: 'draw' };
  if (Math.sign(mH - mA) === Math.sign(bH - bA)) return { points: 1, type: 'winner' };
  return { points: 0, type: 'wrong' };
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

const sendText = async (text: string): Promise<boolean> => {
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
  scorerGoals: number; // gols do artilheiro escolhido (+1 cada)
  scorerLabel: string | null; // nome do artilheiro escolhido
  total: number;       // placar + artilheiro
}

const msgEnd = (m: MatchRow, scorers: ScorerLine[]): string => {
  const lineFor = (s: ScorerLine): string => {
    const partes: string[] = [];
    if (s.points > 0) partes.push(`${typeLabel[s.type] || ''} +${s.points}`);
    if (s.scorerGoals > 0) {
      const golTxt = s.scorerGoals === 1 ? 'gol' : 'gols';
      partes.push(`⚽ ${s.scorerLabel ?? 'artilheiro'} ${s.scorerGoals} ${golTxt} +${s.scorerGoals}`);
    }
    return `• *${s.name}*  +${s.total}  (${partes.join(', ')})`;
  };
  const bloco = scorers.length
    ? ['🎯 *Pontuou nesse jogo:*', ...scorers.map(lineFor)].join('\n')
    : '😬 Ninguém pontuou nesse jogo.';
  return ['🔴 *FIM DE JOGO*', '', scoreLine(m), '', bloco].join('\n');
};

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
        .select('user_id, home_score, away_score, scorer_id')
        .eq('match_id', m.id);
      const scorers = ((betRows ?? []) as BetRow[])
        .map((b) => {
          const a = analyze(b, m);
          // Bônus do artilheiro: +1 por gol do jogador escolhido (jogos do Brasil).
          const scorerGoals = countScorerGoals(m.goalsDetail, b.scorer_id);
          return {
            name: nameByUid.get(b.user_id) || '??',
            points: a.points,
            type: a.type,
            scorerGoals,
            scorerLabel: scorerGoals > 0 ? scorerName(b.scorer_id) : null,
            total: a.points + scorerGoals,
          };
        })
        .filter((s) => s.total > 0)
        .sort((a, b) => b.total - a.total);
      await sendOnce(supabase, `end:${m.id}`, msgEnd(m, scorers));
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
    const { data: allBets } = await supabase.from('bets').select('user_id, match_id, home_score, away_score, scorer_id');
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
        const bonus = countScorerGoals(goalsByMatch.get(mm.id), bet?.scorer_id);
        return acc + placar + bonus;
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
  }
}
