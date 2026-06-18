-- ============================================================
-- CRAVEI! — V2 MIGRATION 005: hardening (segurança/escala)
--   - auditoria das ações sensíveis (criar grupo, resgatar convite, mudar papel/banir)
--   - rate limit anti-brute-force no resgate de convite (códigos curtos)
--   - índices que faltavam
-- Aditivo e não-destrutivo. Pode rodar depois das migrations 001-004.
-- ============================================================

-- ------------------------------------------------------------
-- 1. RATE LIMIT do resgate de convite
-- ------------------------------------------------------------
create table if not exists public.invite_attempts (
  user_id      uuid not null references public.participants (id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index if not exists invite_attempts_idx on public.invite_attempts (user_id, attempted_at);

alter table public.invite_attempts enable row level security;
-- Sem policies: só funções SECURITY DEFINER escrevem/leem.

-- ------------------------------------------------------------
-- 2. redeem_invite com rate limit + auditoria
-- ------------------------------------------------------------
create or replace function public.redeem_invite(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_inv public.group_invites; v_attempts int;
begin
  if auth.uid() is null then raise exception 'Não autenticado.'; end if;

  -- Anti-brute-force: no máx. 20 tentativas por hora por usuário.
  insert into public.invite_attempts (user_id) values (auth.uid());
  select count(*) into v_attempts
    from public.invite_attempts
    where user_id = auth.uid() and attempted_at > now() - interval '1 hour';
  if v_attempts > 20 then
    raise exception 'Muitas tentativas de convite. Tente novamente mais tarde.';
  end if;

  select * into v_inv from public.group_invites
    where code = p_code and status = 'active'
      and (expires_at is null or expires_at > now())
      and (max_uses is null or uses < max_uses);
  if v_inv.id is null then raise exception 'Convite inválido ou expirado.'; end if;

  if exists (select 1 from public.group_members
             where group_id = v_inv.group_id and user_id = auth.uid() and status = 'banned') then
    raise exception 'Você não pode entrar neste grupo.';
  end if;

  insert into public.group_members (group_id, user_id, role, status)
  values (v_inv.group_id, auth.uid(), 'member', 'active')
  on conflict (group_id, user_id) do update set status = 'active';

  update public.group_invites set uses = uses + 1 where id = v_inv.id;

  insert into public.audit_logs (actor_id, group_id, action, entity_type, entity_id)
  values (auth.uid(), v_inv.group_id, 'invite_redeemed', 'invite', v_inv.id::text);

  return v_inv.group_id;
end; $$;

-- ------------------------------------------------------------
-- 3. create_group com auditoria
-- ------------------------------------------------------------
create or replace function public.create_group(
  p_name text, p_description text, p_season_id bigint,
  p_visibility text default 'private', p_entry_fee_cents int default 0,
  p_image_url text default null, p_card_url text default null,
  p_member_limit int default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_ruleset bigint;
begin
  if auth.uid() is null then raise exception 'Não autenticado.'; end if;
  select id into v_ruleset from public.rulesets order by id limit 1;
  insert into public.groups (owner_id, season_id, ruleset_id, name, description,
                             visibility, entry_fee_cents, image_url, card_url, member_limit)
  values (auth.uid(), p_season_id, v_ruleset, p_name, p_description,
          coalesce(p_visibility,'private'), coalesce(p_entry_fee_cents,0),
          p_image_url, p_card_url, p_member_limit)
  returning id into v_id;
  insert into public.group_members (group_id, user_id, role) values (v_id, auth.uid(), 'owner');

  insert into public.audit_logs (actor_id, group_id, action, entity_type, entity_id)
  values (auth.uid(), v_id, 'group_created', 'group', v_id::text);

  return v_id;
end; $$;

-- ------------------------------------------------------------
-- 4. Auditoria de mudança de papel / banimento de membros
-- ------------------------------------------------------------
create or replace function public.audit_member_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.role is distinct from new.role or old.status is distinct from new.status then
    insert into public.audit_logs (actor_id, group_id, action, entity_type, entity_id, metadata)
    values (
      auth.uid(), new.group_id, 'member_changed', 'member', new.user_id::text,
      jsonb_build_object('old_role', old.role, 'new_role', new.role,
                         'old_status', old.status, 'new_status', new.status)
    );
  end if;
  return new;
end; $$;

drop trigger if exists trg_audit_member_change on public.group_members;
create trigger trg_audit_member_change
  after update on public.group_members
  for each row execute function public.audit_member_change();

-- Nota: `bets` já tem índice por (user_id, match_id) via UNIQUE, e por match_id
-- via bets_match_idx; group_members tem group_members_user_idx. Sem novos índices.
