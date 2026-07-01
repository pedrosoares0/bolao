import { createClient } from '@supabase/supabase-js';
import { sendText, ptName, flagEmoji } from '../shared/notify-core.mts';

// Resposta a um Desafio dos Molhados (aceitar/recusar). O app chama
//   POST /.netlify/functions/respond-challenge { challengeId, uid, accept }
// Só o DESAFIADO pode responder, e só enquanto o desafio está 'pending' e o jogo
// não terminou. Atualiza o status e avisa o grupo (aceitou / recusou = "fraco
// bunda mole"). Só desafio 'accepted' transfere ponto no fim (ver rules.ts).

export default async (req: Request) => {
  if (req.method !== 'POST') return Response.json({ error: 'Método não permitido.' }, { status: 405 });

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return Response.json({ error: 'Supabase não configurado.' }, { status: 500 });

  let body: { challengeId?: string; uid?: string; accept?: boolean };
  try { body = await req.json(); } catch { return Response.json({ error: 'JSON inválido.' }, { status: 400 }); }
  const { challengeId, uid, accept } = body;
  if (!challengeId || !uid || typeof accept !== 'boolean') {
    return Response.json({ error: 'challengeId, uid e accept são obrigatórios.' }, { status: 400 });
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: ch } = await supabase
    .from('challenges')
    .select('id, match_id, challenger_id, challenged_id, challenger_pick, challenged_pick, status')
    .eq('id', challengeId)
    .single();
  if (!ch) return Response.json({ error: 'Desafio não encontrado.' }, { status: 404 });
  if (ch.challenged_id !== uid) return Response.json({ error: 'Só o desafiado pode responder.' }, { status: 403 });
  if (ch.status !== 'pending') return Response.json({ error: 'Esse desafio já foi respondido.' }, { status: 409 });

  const { data: match } = await supabase
    .from('matches')
    .select('id, status, home_team, away_team')
    .eq('id', ch.match_id)
    .single();
  if (match?.status === 'FINISHED') {
    return Response.json({ error: 'O jogo já terminou.' }, { status: 400 });
  }

  const newStatus = accept ? 'accepted' : 'declined';
  const { error: updErr } = await supabase
    .from('challenges')
    .update({ status: newStatus })
    .eq('id', challengeId)
    .eq('status', 'pending'); // trava contra corrida (dupla resposta)
  if (updErr) {
    console.error('respond-challenge update:', updErr.message);
    return Response.json({ error: 'Falha ao responder o desafio.' }, { status: 500 });
  }

  // Aviso no WhatsApp (best-effort).
  try {
    const { data: parts } = await supabase
      .from('participants').select('id, name').in('id', [ch.challenger_id, ch.challenged_id]);
    const nameByUid = new Map((parts ?? []).map((p) => [p.id, p.name]));
    const challengerName = nameByUid.get(ch.challenger_id) ?? 'Alguém';
    const challengedName = nameByUid.get(ch.challenged_id) ?? 'Alguém';
    const teamFor = (s: string) => (s === 'HOME' ? match?.home_team ?? '' : match?.away_team ?? '');
    const pickLine = (name: string, s: string) => `*${name}*: classifica ${flagEmoji(teamFor(s))} *${ptName(teamFor(s))}*`;
    const msg = accept
      ? [
        '*DESAFIO ACEITO!* 🤝',
        '',
        `${flagEmoji(match?.home_team ?? '')} ${ptName(match?.home_team ?? '')} x ${ptName(match?.away_team ?? '')} ${flagEmoji(match?.away_team ?? '')}`,
        '',
        `*${challengedName}* x *${challengerName}*!`,
        '',
        'Agora vão os palpites:',
        pickLine(challengerName, ch.challenger_pick),
        pickLine(challengedName, ch.challenged_pick),
        '',
        'Agora é valendo! Quem cravar quem avança rouba *+1 ponto* do outro! 🏆',
      ].join('\n')
      : [
        '*DESAFIO RECUSADO!*🐔',
        '',
        `*${challengedName}* amarelou e recusou o desafio de *${challengerName}*...`,
        'Sábio ou bunda mole?... 😂🐔',
      ].join('\n');
    await sendText(msg);
  } catch (err) {
    console.error('respond-challenge whatsapp:', err);
  }

  return Response.json({ ok: true, status: newStatus });
};
