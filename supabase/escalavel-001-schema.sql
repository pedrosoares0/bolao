-- ============================================================
-- CRAVEI! — DATASET ISOLADO DA BRANCH (sufixo _escalavel)
--
-- Objetivo: a branch feat/plataforma-escalavel usa um conjunto PRÓPRIO de
-- tabelas (mesmos nomes + _escalavel), separado da versão de produção (main).
-- Assim a Copa que está rodando na main NÃO é afetada por nada daqui.
--
-- Este arquivo SUBSTITUI, para a branch, as migrations v2-001..v2-005 (que
-- mexiam nas tabelas sem sufixo). Rode SÓ este no projeto Supabase da branch.
-- Copia os dados atuais (participantes, jogos, apostas, fiados) para começar
-- com o estado real da Copa.
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- 1. CÓPIAS DAS TABELAS LEGADAS (com dados)
-- ============================================================

-- ---- participants_escalavel ----
create table if not exists public.participants_escalavel (
  id         uuid primary key references auth.users (id) on delete cascade,
  username   text unique not null,
  name       text not null,
  avatar_url text not null default '',
  card_url   text,
  status     text not null default 'active' check (status in ('active','banned','deleted')),
  is_platform_admin boolean not null default false,
  created_at timestamptz not null default now()
);
-- Dataset começa SEM usuários (cadastro cria os perfis). Não copiamos os
-- participantes da main de propósito.

alter table public.participants_escalavel enable row level security;
do $$ begin
  create policy "pe_select" on public.participants_escalavel for select to authenticated using (true);
  create policy "pe_update_own" on public.participants_escalavel for update to authenticated
    using (id = auth.uid()) with check (id = auth.uid());
  create policy "pe_insert_own" on public.participants_escalavel for insert to authenticated
    with check (id = auth.uid());
exception when duplicate_object then null; end $$;

-- ---- matches_escalavel ----
create table if not exists public.matches_escalavel (
  id         bigint primary key,
  utc_date   timestamptz not null,
  status     text not null default 'SCHEDULED',
  stage      text,
  group_name text,
  home_team  text not null default 'A definir',
  away_team  text not null default 'A definir',
  home_tla   text not null default '',
  away_tla   text not null default '',
  home_crest text not null default '',
  away_crest text not null default '',
  home_score int,
  away_score int,
  winner     text,
  live_clock text,
  provider   text not null default 'football-data',
  season_id  bigint,
  round_id   bigint,
  updated_at timestamptz not null default now()
);
insert into public.matches_escalavel (id, utc_date, status, stage, group_name, home_team,
  away_team, home_tla, away_tla, home_crest, away_crest, home_score, away_score, winner,
  live_clock, updated_at)
  select id, utc_date, status, stage, group_name, home_team, away_team, home_tla, away_tla,
    home_crest, away_crest, home_score, away_score, winner, live_clock, updated_at
  from public.matches
  on conflict (id) do nothing;

create index if not exists me_utc_idx on public.matches_escalavel (utc_date);
create index if not exists me_season_idx on public.matches_escalavel (season_id, utc_date);
alter table public.matches_escalavel enable row level security;
do $$ begin
  create policy "me_select" on public.matches_escalavel for select to authenticated using (true);
exception when duplicate_object then null; end $$;

-- ---- bets_escalavel ----
create table if not exists public.bets_escalavel (
  id         bigint generated always as identity primary key,
  user_id    uuid   not null references public.participants_escalavel (id) on delete cascade,
  match_id   bigint not null references public.matches_escalavel (id) on delete cascade,
  home_score int    not null check (home_score >= 0),
  away_score int    not null check (away_score >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, match_id)
);
-- Sem cópia de apostas: dataset limpo.

create index if not exists be_match_idx on public.bets_escalavel (match_id);
alter table public.bets_escalavel enable row level security;
do $$ begin
  create policy "be_select" on public.bets_escalavel for select to authenticated using (true);
exception when duplicate_object then null; end $$;

-- ---- submissions_escalavel ----
create table if not exists public.submissions_escalavel (
  user_id      uuid not null references public.participants_escalavel (id) on delete cascade,
  bet_date     date not null,
  submitted_at timestamptz not null default now(),
  primary key (user_id, bet_date)
);
-- Sem cópia de lançamentos: dataset limpo.
alter table public.submissions_escalavel enable row level security;
do $$ begin
  create policy "se_select" on public.submissions_escalavel for select to authenticated using (true);
exception when duplicate_object then null; end $$;

-- ---- special_predictions_escalavel ----
create table if not exists public.special_predictions_escalavel (
  user_id       uuid primary key references public.participants_escalavel (id) on delete cascade,
  champion_team text not null,
  brazil_stage  text not null,
  updated_at    timestamptz not null default now()
);
-- Sem cópia de palpites especiais: dataset limpo.
alter table public.special_predictions_escalavel enable row level security;
do $$ begin
  create policy "spe_select" on public.special_predictions_escalavel for select to authenticated using (true);
  create policy "spe_upsert_own" on public.special_predictions_escalavel for all to authenticated
    using (user_id = auth.uid()) with check (user_id = auth.uid());
exception when duplicate_object then null; end $$;

-- ---- debts_escalavel ----
create table if not exists public.debts_escalavel (
  id         bigint generated always as identity primary key,
  user_id    uuid   not null references public.participants_escalavel (id) on delete cascade,
  amount     numeric(10,2) not null default 2.50,
  debt_date  date   not null default current_date,
  created_at timestamptz not null default now(),
  unique (user_id, debt_date)
);
-- Sem cópia de fiados: dataset limpo.
alter table public.debts_escalavel enable row level security;
do $$ begin
  create policy "de_select" on public.debts_escalavel for select to authenticated using (true);
  create policy "de_insert_own" on public.debts_escalavel for insert to authenticated with check (user_id = auth.uid());
  create policy "de_delete_own" on public.debts_escalavel for delete to authenticated using (user_id = auth.uid());
exception when duplicate_object then null; end $$;

-- ---- sync_state_escalavel ----
create table if not exists public.sync_state_escalavel (
  id             int primary key default 1 check (id = 1),
  last_sync      timestamptz,
  last_live_sync timestamptz,
  live_loop_until timestamptz
);
insert into public.sync_state_escalavel (id) values (1) on conflict do nothing;
alter table public.sync_state_escalavel enable row level security;

-- ============================================================
-- 2. CATÁLOGO (competições/temporadas/rodadas/times)
-- ============================================================
create table if not exists public.competitions_escalavel (
  id bigint generated always as identity primary key,
  sport text not null default 'soccer', provider text not null default 'espn',
  provider_id text, name text not null, country text, logo_url text,
  active boolean not null default true, created_at timestamptz not null default now(),
  unique (provider, provider_id)
);
create table if not exists public.seasons_escalavel (
  id bigint generated always as identity primary key,
  competition_id bigint not null references public.competitions_escalavel (id) on delete cascade,
  provider_id text, name text not null, starts_at timestamptz, ends_at timestamptz,
  status text not null default 'active', created_at timestamptz not null default now(),
  unique (competition_id, name)
);
create table if not exists public.rounds_escalavel (
  id bigint generated always as identity primary key,
  season_id bigint not null references public.seasons_escalavel (id) on delete cascade,
  number int, name text not null, starts_at timestamptz, ends_at timestamptz,
  unique (season_id, name)
);
create table if not exists public.teams_escalavel (
  id bigint generated always as identity primary key,
  provider text not null default 'espn', provider_id text, name text not null,
  short_name text, crest_url text, unique (provider, provider_id)
);
alter table public.competitions_escalavel enable row level security;
alter table public.seasons_escalavel enable row level security;
alter table public.rounds_escalavel enable row level security;
alter table public.teams_escalavel enable row level security;
do $$ begin
  create policy "ce_sel" on public.competitions_escalavel for select to authenticated using (true);
  create policy " se_sel" on public.seasons_escalavel for select to authenticated using (true);
  create policy "re_sel" on public.rounds_escalavel for select to authenticated using (true);
  create policy "te_sel" on public.teams_escalavel for select to authenticated using (true);
exception when duplicate_object then null; end $$;

-- Seed competições + temporadas 2026
insert into public.competitions_escalavel (sport, provider, provider_id, name, country, active)
values ('soccer','espn','fifa.world','Copa do Mundo','Mundo',true),
       ('soccer','espn','bra.1','Brasileirão Série A','Brasil',true)
on conflict (provider, provider_id) do nothing;
insert into public.seasons_escalavel (competition_id, provider_id, name, status)
  select id, '2026', '2026', 'active' from public.competitions_escalavel
  where provider='espn' and provider_id in ('fifa.world','bra.1')
on conflict (competition_id, name) do nothing;

-- Vincula os jogos copiados (Copa) à temporada 2026 da Copa
update public.matches_escalavel m
set season_id = s.id
from public.seasons_escalavel s
join public.competitions_escalavel c on c.id = s.competition_id
where c.provider='espn' and c.provider_id='fifa.world' and s.name='2026' and m.season_id is null;

-- ============================================================
-- 3. RULESETS
-- ============================================================
create table if not exists public.rulesets_escalavel (
  id bigint generated always as identity primary key,
  version int not null default 1, name text not null default 'Padrão Cravei',
  exact_points int not null default 3, outcome_points int not null default 1,
  draw_points int not null default 2, lock_minutes int not null default 1,
  reveal_policy text not null default 'after_kickoff',
  tiebreakers text[] not null default array['exact_count','outcome_count'],
  config_json jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
alter table public.rulesets_escalavel enable row level security;
do $$ begin
  create policy "rse_sel" on public.rulesets_escalavel for select to authenticated using (true);
exception when duplicate_object then null; end $$;
insert into public.rulesets_escalavel (version, name) values (1, 'Padrão Cravei') on conflict do nothing;

-- ============================================================
-- 4. GRUPOS + MEMBROS + CONVITES + PAGAMENTOS (com PIX por grupo)
-- ============================================================
create table if not exists public.groups_escalavel (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.participants_escalavel (id) on delete restrict,
  season_id bigint references public.seasons_escalavel (id) on delete set null,
  ruleset_id bigint references public.rulesets_escalavel (id) on delete set null,
  name text not null check (char_length(name) between 2 and 60),
  description text check (char_length(description) <= 500),
  image_url text, card_url text,
  visibility text not null default 'private' check (visibility in ('private','public')),
  join_policy text not null default 'invite' check (join_policy in ('invite','approval','open')),
  member_limit int check (member_limit is null or member_limit between 2 and 1000),
  entry_fee_cents int not null default 0 check (entry_fee_cents >= 0),
  pix_key text, pix_recipient text, pix_bank text,
  status text not null default 'active' check (status in ('active','closed','archived')),
  created_at timestamptz not null default now()
);
create index if not exists ge_season_idx on public.groups_escalavel (season_id);
create index if not exists ge_owner_idx on public.groups_escalavel (owner_id);

create table if not exists public.group_members_escalavel (
  group_id uuid not null references public.groups_escalavel (id) on delete cascade,
  user_id uuid not null references public.participants_escalavel (id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  status text not null default 'active' check (status in ('active','banned','left')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists gme_user_idx on public.group_members_escalavel (user_id);

create or replace function public.is_group_member_escalavel(p_group uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.group_members_escalavel gm
    where gm.group_id = p_group and gm.user_id = auth.uid() and gm.status = 'active');
$$;
create or replace function public.is_group_admin_escalavel(p_group uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.group_members_escalavel gm
    where gm.group_id = p_group and gm.user_id = auth.uid()
      and gm.status = 'active' and gm.role in ('owner','admin'));
$$;

alter table public.groups_escalavel enable row level security;
alter table public.group_members_escalavel enable row level security;
do $$ begin
  create policy "ge_select" on public.groups_escalavel for select to authenticated
    using (visibility = 'public' or public.is_group_member_escalavel(id));
  create policy "ge_insert" on public.groups_escalavel for insert to authenticated with check (owner_id = auth.uid());
  create policy "ge_update" on public.groups_escalavel for update to authenticated
    using (public.is_group_admin_escalavel(id)) with check (public.is_group_admin_escalavel(id));
  create policy "ge_delete" on public.groups_escalavel for delete to authenticated using (owner_id = auth.uid());
  create policy "gme_select" on public.group_members_escalavel for select to authenticated
    using (public.is_group_member_escalavel(group_id));
  create policy "gme_admin" on public.group_members_escalavel for all to authenticated
    using (public.is_group_admin_escalavel(group_id)) with check (public.is_group_admin_escalavel(group_id));
  create policy "gme_leave" on public.group_members_escalavel for delete to authenticated using (user_id = auth.uid());
exception when duplicate_object then null; end $$;

create table if not exists public.group_invites_escalavel (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups_escalavel (id) on delete cascade,
  token_hash text not null, code text unique,
  created_by uuid not null references public.participants_escalavel (id) on delete cascade,
  expires_at timestamptz, max_uses int, uses int not null default 0,
  status text not null default 'active' check (status in ('active','revoked')),
  created_at timestamptz not null default now()
);
create index if not exists gie_group_idx on public.group_invites_escalavel (group_id);
alter table public.group_invites_escalavel enable row level security;
do $$ begin
  create policy "gie_admin" on public.group_invites_escalavel for all to authenticated
    using (public.is_group_admin_escalavel(group_id)) with check (public.is_group_admin_escalavel(group_id));
exception when duplicate_object then null; end $$;

create table if not exists public.group_payments_escalavel (
  id bigint generated always as identity primary key,
  group_id uuid not null references public.groups_escalavel (id) on delete cascade,
  user_id uuid not null references public.participants_escalavel (id) on delete cascade,
  ref_date date not null, amount_cents int not null check (amount_cents >= 0),
  kind text not null default 'pix' check (kind in ('pix','fiado')),
  settled_at timestamptz, created_at timestamptz not null default now(),
  unique (group_id, user_id, ref_date)
);
create index if not exists gpe_group_idx on public.group_payments_escalavel (group_id);
alter table public.group_payments_escalavel enable row level security;
do $$ begin
  create policy "gpe_select" on public.group_payments_escalavel for select to authenticated
    using (public.is_group_member_escalavel(group_id));
  create policy "gpe_insert_own" on public.group_payments_escalavel for insert to authenticated
    with check (user_id = auth.uid() and public.is_group_member_escalavel(group_id));
  create policy "gpe_update_own" on public.group_payments_escalavel for update to authenticated
    using (user_id = auth.uid()) with check (user_id = auth.uid());
  create policy "gpe_admin" on public.group_payments_escalavel for all to authenticated
    using (public.is_group_admin_escalavel(group_id)) with check (public.is_group_admin_escalavel(group_id));
exception when duplicate_object then null; end $$;

create table if not exists public.notifications_escalavel (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.participants_escalavel (id) on delete cascade,
  type text not null, payload jsonb not null default '{}'::jsonb,
  read_at timestamptz, created_at timestamptz not null default now()
);
alter table public.notifications_escalavel enable row level security;
do $$ begin
  create policy "ne_sel_own" on public.notifications_escalavel for select to authenticated using (user_id = auth.uid());
  create policy "ne_upd_own" on public.notifications_escalavel for update to authenticated
    using (user_id = auth.uid()) with check (user_id = auth.uid());
exception when duplicate_object then null; end $$;

create table if not exists public.audit_logs_escalavel (
  id bigint generated always as identity primary key,
  actor_id uuid references public.participants_escalavel (id) on delete set null,
  group_id uuid references public.groups_escalavel (id) on delete set null,
  action text not null, entity_type text, entity_id text,
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists ale_group_idx on public.audit_logs_escalavel (group_id, created_at);
alter table public.audit_logs_escalavel enable row level security;
do $$ begin
  create policy "ale_sel_admin" on public.audit_logs_escalavel for select to authenticated
    using (group_id is not null and public.is_group_admin_escalavel(group_id));
exception when duplicate_object then null; end $$;

create table if not exists public.invite_attempts_escalavel (
  user_id uuid not null references public.participants_escalavel (id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index if not exists iae_idx on public.invite_attempts_escalavel (user_id, attempted_at);
alter table public.invite_attempts_escalavel enable row level security;

-- ============================================================
-- 5. FUNÇÕES (sufixadas, apontando para o dataset _escalavel)
-- ============================================================

-- submit_bets_escalavel: lança/edita apostas com trava no servidor (1 min antes)
create or replace function public.submit_bets_escalavel(p_bets jsonb, p_bet_date date)
returns void language plpgsql security definer set search_path = public as $$
declare b record;
begin
  if auth.uid() is null then raise exception 'Não autenticado.'; end if;
  if p_bets is null or jsonb_array_length(p_bets) = 0 then raise exception 'Nenhum palpite enviado.'; end if;
  for b in select * from jsonb_to_recordset(p_bets) as x(match_id bigint, home_score int, away_score int)
  loop
    if b.match_id is null or b.home_score is null or b.away_score is null
       or b.home_score < 0 or b.away_score < 0 then raise exception 'Palpite inválido.'; end if;
    if not exists (select 1 from public.matches_escalavel m
      where m.id = b.match_id and m.utc_date - interval '1 minute' > now()) then
      raise exception 'Apostas encerradas para o jogo %.', b.match_id;
    end if;
    insert into public.bets_escalavel (user_id, match_id, home_score, away_score)
    values (auth.uid(), b.match_id, b.home_score, b.away_score)
    on conflict (user_id, match_id) do update
      set home_score = excluded.home_score, away_score = excluded.away_score, updated_at = now();
  end loop;
  insert into public.submissions_escalavel (user_id, bet_date) values (auth.uid(), p_bet_date)
  on conflict (user_id, bet_date) do update set submitted_at = now();
end; $$;
revoke all on function public.submit_bets_escalavel(jsonb, date) from public, anon;
grant execute on function public.submit_bets_escalavel(jsonb, date) to authenticated;

-- create_group_escalavel
create or replace function public.create_group_escalavel(
  p_name text, p_description text, p_season_id bigint,
  p_visibility text default 'private', p_entry_fee_cents int default 0,
  p_image_url text default null, p_card_url text default null, p_member_limit int default null,
  p_pix_key text default null, p_pix_recipient text default null, p_pix_bank text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_ruleset bigint;
begin
  if auth.uid() is null then raise exception 'Não autenticado.'; end if;
  select id into v_ruleset from public.rulesets_escalavel order by id limit 1;
  insert into public.groups_escalavel (owner_id, season_id, ruleset_id, name, description,
    visibility, entry_fee_cents, image_url, card_url, member_limit, pix_key, pix_recipient, pix_bank)
  values (auth.uid(), p_season_id, v_ruleset, p_name, p_description,
    coalesce(p_visibility,'private'), coalesce(p_entry_fee_cents,0), p_image_url, p_card_url,
    p_member_limit, p_pix_key, p_pix_recipient, p_pix_bank)
  returning id into v_id;
  insert into public.group_members_escalavel (group_id, user_id, role) values (v_id, auth.uid(), 'owner');
  insert into public.audit_logs_escalavel (actor_id, group_id, action, entity_type, entity_id)
  values (auth.uid(), v_id, 'group_created', 'group', v_id::text);
  return v_id;
end; $$;
revoke all on function public.create_group_escalavel(text,text,bigint,text,int,text,text,int,text,text,text) from public, anon;
grant execute on function public.create_group_escalavel(text,text,bigint,text,int,text,text,int,text,text,text) to authenticated;

-- redeem_invite_escalavel (com rate limit + auditoria)
create or replace function public.redeem_invite_escalavel(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_inv public.group_invites_escalavel; v_attempts int;
begin
  if auth.uid() is null then raise exception 'Não autenticado.'; end if;
  insert into public.invite_attempts_escalavel (user_id) values (auth.uid());
  select count(*) into v_attempts from public.invite_attempts_escalavel
    where user_id = auth.uid() and attempted_at > now() - interval '1 hour';
  if v_attempts > 20 then raise exception 'Muitas tentativas. Tente mais tarde.'; end if;

  select * into v_inv from public.group_invites_escalavel
    where code = p_code and status = 'active'
      and (expires_at is null or expires_at > now())
      and (max_uses is null or uses < max_uses);
  if v_inv.id is null then raise exception 'Convite inválido ou expirado.'; end if;
  if exists (select 1 from public.group_members_escalavel
             where group_id = v_inv.group_id and user_id = auth.uid() and status = 'banned') then
    raise exception 'Você não pode entrar neste grupo.';
  end if;
  insert into public.group_members_escalavel (group_id, user_id, role, status)
  values (v_inv.group_id, auth.uid(), 'member', 'active')
  on conflict (group_id, user_id) do update set status = 'active';
  update public.group_invites_escalavel set uses = uses + 1 where id = v_inv.id;
  insert into public.audit_logs_escalavel (actor_id, group_id, action, entity_type, entity_id)
  values (auth.uid(), v_inv.group_id, 'invite_redeemed', 'invite', v_inv.id::text);
  return v_inv.group_id;
end; $$;
revoke all on function public.redeem_invite_escalavel(text) from public, anon;
grant execute on function public.redeem_invite_escalavel(text) to authenticated;

-- Auditoria de mudança de membro
create or replace function public.audit_member_change_escalavel()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.role is distinct from new.role or old.status is distinct from new.status then
    insert into public.audit_logs_escalavel (actor_id, group_id, action, entity_type, entity_id, metadata)
    values (auth.uid(), new.group_id, 'member_changed', 'member', new.user_id::text,
      jsonb_build_object('old_role', old.role, 'new_role', new.role,
                         'old_status', old.status, 'new_status', new.status));
  end if;
  return new;
end; $$;
drop trigger if exists trg_audit_member_change_escalavel on public.group_members_escalavel;
create trigger trg_audit_member_change_escalavel
  after update on public.group_members_escalavel
  for each row execute function public.audit_member_change_escalavel();

-- ============================================================
-- 6. (REMOVIDO) Não criamos nenhum grupo automaticamente.
--    O dataset começa limpo: sem grupos e sem usuários. Os grupos são criados
--    pelo app (o criador vira dono e define a chave PIX).
-- ============================================================

-- ============================================================
-- FIM. A branch usa só *_escalavel. A main segue intacta.
-- ============================================================
