// Nomes das tabelas/RPCs usados pela BRANCH escalável.
//
// A branch opera num dataset PRÓPRIO (sufixo _escalavel), isolado da versão de
// produção (main). Centralizar aqui deixa trivial alternar/voltar depois:
// para usar as tabelas da main, é só remover o sufixo neste arquivo.
const SUFFIX = '_escalavel';
const t = (base: string) => `${base}${SUFFIX}`;

export const T = {
  participants: t('participants'),
  matches: t('matches'),
  bets: t('bets'),
  submissions: t('submissions'),
  specialPredictions: t('special_predictions'),
  debts: t('debts'),
  syncState: t('sync_state'),
  competitions: t('competitions'),
  seasons: t('seasons'),
  rounds: t('rounds'),
  teams: t('teams'),
  rulesets: t('rulesets'),
  groups: t('groups'),
  groupMembers: t('group_members'),
  groupInvites: t('group_invites'),
  groupPayments: t('group_payments'),
  notifications: t('notifications'),
  auditLogs: t('audit_logs'),
} as const;

export const RPC = {
  submitBets: t('submit_bets'),
  createGroup: t('create_group'),
  redeemInvite: t('redeem_invite'),
} as const;
