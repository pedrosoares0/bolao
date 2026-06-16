import { syncMatches } from '../shared/sync-core.mts';

// Endpoint HTTP público: o app chama /.netlify/functions/sync-matches ao abrir
// para garantir placares frescos. O throttle interno (sync_state, 3 min) evita abuso.
export default async () => {
  try {
    const result = await syncMatches();
    return Response.json(result);
  } catch (err) {
    // Loga o detalhe técnico no servidor, mas devolve uma mensagem genérica:
    // por ser um endpoint público e anônimo, não expomos nomes de env vars nem
    // erros internos do Supabase/football-data no corpo da resposta.
    console.error('sync-matches:', err);
    return Response.json({ error: 'Falha ao sincronizar os jogos.' }, { status: 500 });
  }
};
