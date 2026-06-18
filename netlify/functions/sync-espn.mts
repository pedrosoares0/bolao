import { syncEspnSeasons } from '../shared/espn-sync.mts';

// Endpoint manual: sincroniza os jogos das ligas ESPN (ex.: Brasileirão) para a
// tabela `matches`, vinculados à temporada. NÃO está no cron de propósito — só
// ligue o agendamento depois que o front filtrar partidas por competição, senão
// os jogos do Brasileirão aparecem misturados na tela da Copa (ver PLANO_V2.md).
export default async () => {
  try {
    const result = await syncEspnSeasons();
    return Response.json(result);
  } catch (err) {
    console.error('sync-espn:', err);
    return Response.json({ error: 'Falha ao sincronizar ligas ESPN.' }, { status: 500 });
  }
};
