import { syncMatches } from '../shared/sync-core.mts';

// Agendada: roda a cada 1 minuto no Netlify para manter jogos e placares
// atualizados (mesmo sem ninguém abrir o app) e disparar as notificações
// do WhatsApp perto do tempo real (gol, intervalo, fim de jogo).
//
// O cron é o MÍNIMO do Netlify (1 min). Para descer o "piso" do ao vivo abaixo
// disso mesmo sem ninguém com o app aberto, ele também dispara (fire-and-forget)
// o loop de background `live-loop-background`, que atualiza a ESPN a cada ~12s.
// A lease (sync_state.live_loop_until) garante que só um loop rode por vez, então
// chamar todo minuto é seguro — invocações extras saem na hora.
export default async () => {
  try {
    const result = await syncMatches(true);
    console.log('sync-matches-cron:', JSON.stringify(result));
  } catch (err) {
    console.error('sync-matches-cron:', err);
  }

  // Cutuca o loop de background (não bloqueia: ele responde 202 e segue sozinho).
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL;
  if (base) {
    try {
      await fetch(`${base}/.netlify/functions/live-loop-background`, { method: 'POST' });
    } catch (err) {
      console.warn('Não consegui acionar o live-loop-background:', err);
    }
  }
};

export const config = { schedule: '* * * * *' };
