import { syncMatches } from '../shared/sync-core.mts';

// Agendada: roda a cada 1 minuto no Netlify para manter jogos e placares
// atualizados (mesmo sem ninguém abrir o app) e disparar as notificações
// do WhatsApp perto do tempo real (gol, intervalo, fim de jogo). Com a ESPN
// como fonte do ao vivo, 1 min deixa o placar/minuto bem próximo do tempo real.
// (football-data free: 10 req/min; aqui é 1/min — bem dentro do limite.)
export default async () => {
  try {
    const result = await syncMatches(true);
    console.log('sync-matches-cron:', JSON.stringify(result));
  } catch (err) {
    console.error('sync-matches-cron:', err);
  }
};

export const config = { schedule: '* * * * *' };
