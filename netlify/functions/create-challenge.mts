import { createClient } from '@supabase/supabase-js';
import { sendText, ptName, flagEmoji } from '../shared/notify-core.mts';

// Cria um "Desafio dos Molhados": o app chama
//   POST /.netlify/functions/create-challenge { matchId, challengerUid, challengedUid }
// Valida (mata-mata não encerrado, ambos com classificados DIFERENTES nos palpites,
// sem desafio já existente entre os dois nesse jogo), grava e avisa no WhatsApp.
// Os "picks" (HOME/AWAY) são deduzidos dos palpites no servidor — não confia no cliente.

type Side = 'HOME' | 'AWAY';

interface BetRow { home_score: number; away_score: number; pens_winner: string | null }

// Classificado que o palpite aponta: vencedor cravado no placar ou, no empate, o
// pens_winner escolhido. null se não dá pra saber (ex.: empate sem escolha).
function advancerOf(bet: BetRow | undefined, stage: string | null): Side | null {
  if (!bet || stage === 'GROUP_STAGE') return null;
  if (bet.home_score !== bet.away_score) return bet.home_score > bet.away_score ? 'HOME' : 'AWAY';
  return bet.pens_winner === 'HOME' || bet.pens_winner === 'AWAY' ? bet.pens_winner : null;
}

export default async (req: Request) => {
  if (req.method !== 'POST') return Response.json({ error: 'Método não permitido.' }, { status: 405 });

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return Response.json({ error: 'Supabase não configurado.' }, { status: 500 });

  let body: { matchId?: number | string; challengerUid?: string; challengedUid?: string };
  try { body = await req.json(); } catch { return Response.json({ error: 'JSON inválido.' }, { status: 400 }); }
  const matchId = Number(body.matchId);
  const challengerUid = body.challengerUid;
  const challengedUid = body.challengedUid;
  if (!matchId || !challengerUid || !challengedUid) {
    return Response.json({ error: 'matchId, challengerUid e challengedUid são obrigatórios.' }, { status: 400 });
  }
  if (challengerUid === challengedUid) {
    return Response.json({ error: 'Não dá pra desafiar a si mesmo.' }, { status: 400 });
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Jogo: precisa ser mata-mata e ainda NÃO encerrado (desafia durante o jogo).
  const { data: match } = await supabase
    .from('matches')
    .select('id, stage, status, home_team, away_team')
    .eq('id', matchId)
    .single();
  if (!match) return Response.json({ error: 'Jogo não encontrado.' }, { status: 404 });
  if (!match.stage || match.stage === 'GROUP_STAGE') {
    return Response.json({ error: 'Desafio só vale no mata-mata.' }, { status: 400 });
  }
  if (match.status === 'FINISHED') {
    return Response.json({ error: 'O jogo já terminou.' }, { status: 400 });
  }

  // Palpites dos dois → classificados. Precisam existir e ser DIFERENTES.
  const { data: betRows } = await supabase
    .from('bets')
    .select('user_id, home_score, away_score, pens_winner')
    .eq('match_id', matchId)
    .in('user_id', [challengerUid, challengedUid]);
  const byUid = new Map((betRows ?? []).map((b) => [b.user_id, b as BetRow]));
  const challengerPick = advancerOf(byUid.get(challengerUid), match.stage);
  const challengedPick = advancerOf(byUid.get(challengedUid), match.stage);
  if (!challengerPick || !challengedPick) {
    return Response.json({ error: 'Os dois precisam ter escolhido um classificado.' }, { status: 400 });
  }
  if (challengerPick === challengedPick) {
    return Response.json({ error: 'Vocês escolheram o mesmo classificado — sem desafio.' }, { status: 400 });
  }

  // Já existe desafio entre os dois nesse jogo (qualquer direção)?
  const { data: existing } = await supabase
    .from('challenges')
    .select('id')
    .eq('match_id', matchId)
    .or(`and(challenger_id.eq.${challengerUid},challenged_id.eq.${challengedUid}),and(challenger_id.eq.${challengedUid},challenged_id.eq.${challengerUid})`)
    .limit(1);
  if (existing && existing.length > 0) {
    return Response.json({ error: 'Já existe um desafio entre vocês nesse jogo.' }, { status: 409 });
  }

  const { data: inserted, error: insErr } = await supabase
    .from('challenges')
    .insert({
      match_id: matchId,
      challenger_id: challengerUid,
      challenged_id: challengedUid,
      challenger_pick: challengerPick,
      challenged_pick: challengedPick,
    })
    .select('id')
    .single();
  if (insErr) {
    console.error('create-challenge insert:', insErr.message);
    return Response.json({ error: 'Falha ao registrar o desafio.' }, { status: 500 });
  }

  // Aviso no WhatsApp (best-effort: não derruba a criação se o envio falhar).
  try {
    const { data: parts } = await supabase
      .from('participants').select('id, name').in('id', [challengerUid, challengedUid]);
    const nameByUid = new Map((parts ?? []).map((p) => [p.id, p.name]));
    const challengerName = nameByUid.get(challengerUid) ?? 'Alguém';
    const challengedName = nameByUid.get(challengedUid) ?? 'Alguém';
    const teamFor = (s: Side) => (s === 'HOME' ? match.home_team : match.away_team);
    const pickLine = (name: string, s: Side) => `🌊 *${name}*: classifica ${flagEmoji(teamFor(s))} *${ptName(teamFor(s))}*`;
    const msg = [
      '⚔️ *DESAFIO ÉPICO ENTRE OS MOLHADOS* ⚔️',
      '',
      `${flagEmoji(match.home_team)} ${ptName(match.home_team)} x ${ptName(match.away_team)} ${flagEmoji(match.away_team)}`,
      '',
      pickLine(challengerName, challengerPick),
      pickLine(challengedName, challengedPick),
      '',
      'Quem cravar quem avança rouba *+1 ponto* do outro! 🏆',
    ].join('\n');
    await sendText(msg);
  } catch (err) {
    console.error('create-challenge whatsapp:', err);
  }

  return Response.json({ ok: true, id: inserted?.id, challengerPick, challengedPick });
};
