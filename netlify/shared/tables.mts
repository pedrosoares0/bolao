// Nomes de tabela usados pelas funções da BRANCH escalável (dataset _escalavel,
// isolado da main). Centralizado para alternar fácil (ver também src/lib/tables.ts).
const SUFFIX = '_escalavel';
const t = (base: string) => `${base}${SUFFIX}`;

export const TABLES = {
  matches: t('matches'),
  syncState: t('sync_state'),
  seasons: t('seasons'),
  competitions: t('competitions'),
  participants: t('participants'),
  bets: t('bets'),
} as const;

// Notificações (WhatsApp) ficam DESLIGADAS na branch: evita spam em teste e o
// acoplamento com tabelas de produção (sent_notifications/participants da main).
export const NOTIFICATIONS_ENABLED = false;
