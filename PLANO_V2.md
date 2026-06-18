# Cravei! — Plano V2 (plataforma escalável)

Transformar o bolão único (Copa 2026) em plataforma multiusuário, multigrupo e
multicampeonato. Branch: `feat/plataforma-escalavel`. Base de referência:
[ARQUITETURA_ESCALAVEL.md](ARQUITETURA_ESCALAVEL.md).

## Decisões travadas

| Tema | Decisão |
|------|---------|
| **Marca** | "Bandidos Apostados" → **Cravei!** |
| **Palpite × grupo** | Opção A — **1 palpite por usuário/partida/competição**. Grupos só calculam rankings diferentes sobre os mesmos palpites. |
| **Dinheiro** | App **não custodia** dinheiro. Cada grupo registra o valor cobrado e mostra PIX/fiado (como hoje). Sem gateway, sem KYC. |
| **Fonte de dados** | **ESPN** (já usada no live sync). Lançamento com **Brasileirão + Copa 2026**; demais campeonatos depois sem mudar a lógica central. |
| **Papéis** | `admin` (plataforma) · `owner` (dono do grupo) · `admin` (admin do grupo) · `member` (participante). |
| **Backend** | Supabase (Postgres + RLS + Auth + Realtime + Storage) + Netlify/Edge Functions p/ sync e pontuação. |

## Modelo de dados (multi-tenant)

```text
profiles(id→auth.users, username uniq, display_name, avatar_url, card_url, status, is_platform_admin, created_at)
competitions(id, sport, provider, provider_id, name, country, logo_url, active)
seasons(id, competition_id, provider_id, name, starts_at, ends_at, status)
rounds(id, season_id, number, name, starts_at, ends_at)
teams(id, provider_id, name, short_name, crest_url)
matches(id, season_id, round_id, provider_id, home_team_id, away_team_id,
        kickoff_at, status, stage, home_score, away_score, winner, live_clock, updated_at)
predictions(id, user_id, match_id, home_score, away_score, submitted_at, updated_at)  -- unique(user_id, match_id)
rulesets(id, version, exact_points, outcome_points, draw_points, lock_minutes, reveal_policy, tiebreakers, config_json)
groups(id, owner_id, season_id, ruleset_id, name, description, image_url, card_url,
       visibility, join_policy, member_limit, entry_fee_cents, status, created_at)
group_members(group_id, user_id, role, status, joined_at)  -- role: owner|admin|member ; status: active|banned
group_invites(id, group_id, token_hash, code, created_by, expires_at, max_uses, uses, status)
group_payments(id, group_id, user_id, ref_date, amount_cents, kind, settled_at, created_at)  -- registro PIX/fiado por grupo
notifications(id, user_id, type, payload, read_at, created_at)
audit_logs(id, actor_id, group_id, action, entity_type, entity_id, metadata, created_at)
```

Convite: guardar `token_hash` (nunca o token puro), igual senha.

## Fases

### Fase 1 — Fundação multiusuário ← AQUI
- [x] Branch + roadmap.
- [ ] Schema multi-tenant + RLS (additivo; mantém app atual rodando).
- [ ] Cadastro aberto (email/senha) + recuperação de senha + perfil/avatar.
- [ ] Remover participantes fixos do seed; migrar Copa atual p/ competição/temporada.
- [ ] Rename Cravei!.

### Fase 2 — Grupos e convites
- Criar/editar grupo (nome, descrição, imagem, card, valor, campeonato, privacidade).
- Membros, papéis, convites por link+código, entrar/sair.
- RLS de isolamento por grupo. Ranking separado por grupo.
- Tela de admin do grupo. Registro de pagamento/fiado por grupo.

### Fase 3 — Multicampeonato (ESPN)
- Sync ESPN p/ Brasileirão + Copa (competições, temporadas, rodadas, times).
- Correções administrativas, jogos adiados/cancelados, pênaltis.
- Palpites por rodada + lembretes.

### Fase 4 — Escala e operação
- [x] Hardening (v2-005): auditoria (criar grupo, resgatar convite, papel/ban),
  rate limit anti-brute-force no resgate de convite, índices.
- **Pontuação no servidor: ADIADA (decisão).** As regras (placar/empate/vencedor +
  fogos ON FIRE com reset compartilhado + MVP + critérios de desempate) são
  intrincadas e bem testadas no cliente ([rules.ts](src/utils/rules.ts) +
  rules.test.ts). Reimplementar em PL/pgSQL criaria 2 fontes de verdade
  divergentes. Na escala atual (dezenas de usuários, ~104 jogos) o cálculo no
  cliente basta. Reavaliar quando: muitos grupos grandes, ou pagar premiação
  exigir número auditável no servidor. Caminho: RPC idempotente que recalcula por
  partida e materializa `group_standings`.
- Pendente: paginação de grupos/membros, observabilidade, backups, testes de carga.

### Fase 5 — Expansão
- Novas ligas sem tocar a lógica central, grupos públicos, social, monetização.

## Segurança (não negociável)
- Lockout de palpite pelo **horário do banco** (já existe na `submit_bets`).
- RLS: usuário só vê dados de grupos a que pertence; admin não edita palpite alheio.
- Convites com hash, anti-enumeração, expiração/limite de uso.
- Funções transacionais p/ operações críticas; políticas de exibição de palpite no banco, não só no React.
