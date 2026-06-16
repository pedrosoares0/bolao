import { syncMatches } from '../shared/sync-core.mts';

// Agendada: roda a cada 2 minutos no Netlify para manter jogos e placares
// atualizados (mesmo sem ninguém abrir o app) e disparar as notificações
// do WhatsApp perto do tempo real (gol, intervalo, fim de jogo).
export default async () => {
  try {
    const result = await syncMatches(true);
    console.log('sync-matches-cron:', JSON.stringify(result));
  } catch (err) {
    console.error('sync-matches-cron:', err);
  }
};

export const config = { schedule: '*/2 * * * *' };
