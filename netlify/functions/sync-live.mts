import { syncLive } from '../shared/sync-core.mts';

// Endpoint HTTP do AO VIVO: o app chama /.netlify/functions/sync-live a cada
// ~10s enquanto há jogo rolando. Bate SÓ na ESPN (rápida e grátis) e atualiza
// placar/minuto/gols — sem football-data, então não pesa no limite de 10 req/min.
// Throttle interno de 10s (em sync-core) evita abuso com vários aparelhos abertos.
export default async () => {
  try {
    const result = await syncLive();
    return Response.json(result);
  } catch (err) {
    console.error('sync-live:', err);
    return Response.json({ error: 'Falha ao sincronizar o ao vivo.' }, { status: 500 });
  }
};
