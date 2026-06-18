import { syncEspnSeasons } from '../shared/espn-sync.mts';

// Agendada: sincroniza as ligas ESPN (ex.: Brasileirão) a cada 15 minutos.
// Cadência conservadora de propósito — a cada execução varre uma janela de
// dias (ver windowFor em espn-sync). O placar AO VIVO rápido (ESPN a cada ~12s)
// hoje cobre só a Copa; para o Brasileirão o placar atualiza no ritmo deste cron.
// Ajuste o `schedule` se quiser mais/menos frequência.
export default async () => {
  try {
    const result = await syncEspnSeasons();
    console.log('sync-espn-cron:', JSON.stringify(result));
  } catch (err) {
    console.error('sync-espn-cron:', err);
  }
};

export const config = { schedule: '*/15 * * * *' };
