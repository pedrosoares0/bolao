import { syncMatches } from '../shared/sync-core.mts';

// Endpoint HTTP: o app chama /.netlify/functions/sync-matches ao abrir
// para garantir placares frescos. O throttle interno evita abuso.
export default async () => {
  try {
    const result = await syncMatches();
    return Response.json(result);
  } catch (err) {
    console.error('sync-matches:', err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
};
