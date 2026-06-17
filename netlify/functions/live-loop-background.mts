import { runLiveLoop } from '../shared/sync-core.mts';

// Função de BACKGROUND (sufixo "-background" → o Netlify deixa rodar por vários
// minutos, devolvendo 202 na hora). Disparada pelo cron de 1 min, mantém o ao
// vivo atualizado a cada ~12s sem ninguém precisar estar com o app aberto.
// A trava (lease) em sync_state garante que só um loop rode por vez.
export default async () => {
  try {
    const result = await runLiveLoop();
    console.log('live-loop-background:', JSON.stringify(result));
  } catch (err) {
    console.error('live-loop-background:', err);
  }
};
