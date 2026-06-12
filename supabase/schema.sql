-- ============================================================
-- BOLÃO BANDIDOS APOSTADOS — SCHEMA
-- Rode este arquivo PRIMEIRO no Supabase: Dashboard > SQL Editor > New query
-- Depois rode o seed.sql (edite as senhas antes!).
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. PARTICIPANTES (perfil ligado ao auth.users do Supabase)
-- ------------------------------------------------------------
create table public.participants (
  id         uuid primary key references auth.users (id) on delete cascade,
  username   text unique not null,
  name       text not null,
  avatar_url text not null default '/imagens/logo.png',
  created_at timestamptz not null default now()
);

alter table public.participants enable row level security;

create policy "participants_select_authenticated"
  on public.participants for select
  to authenticated
  using (true);

-- Cria o perfil automaticamente quando um usuário é criado no Auth.
-- username = parte antes do @ do e-mail (ex: pedro@bolao.app -> pedro)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.participants (id, username, name, avatar_url)
  values (
    new.id,
    split_part(new.email, '@', 1),
    initcap(split_part(new.email, '@', 1)),
    '/imagens/' || split_part(new.email, '@', 1) || '.png'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- 2. PARTIDAS (preenchida pela Netlify Function via football-data.org)
-- ------------------------------------------------------------
create table public.matches (
  id         bigint primary key,            -- id da partida na football-data.org
  utc_date   timestamptz not null,          -- kickoff em UTC (o front converte p/ horário de Brasília)
  status     text not null default 'SCHEDULED', -- SCHEDULED | TIMED | IN_PLAY | PAUSED | FINISHED ...
  stage      text,                          -- GROUP_STAGE | LAST_32 | LAST_16 | QUARTER_FINALS | ...
  group_name text,                          -- "Group A" ... (null no mata-mata)
  home_team  text not null default 'A definir',
  away_team  text not null default 'A definir',
  home_tla   text not null default '',
  away_tla   text not null default '',
  home_crest text not null default '',      -- URL da bandeira (fallback caso o país não esteja mapeado)
  away_crest text not null default '',
  home_score int,
  away_score int,
  updated_at timestamptz not null default now()
);

create index matches_utc_date_idx on public.matches (utc_date);

alter table public.matches enable row level security;

create policy "matches_select_authenticated"
  on public.matches for select
  to authenticated
  using (true);
-- Escrita: apenas a service_role (Netlify Function), que ignora RLS por padrão.

-- ------------------------------------------------------------
-- 3. APOSTAS
-- ------------------------------------------------------------
create table public.bets (
  id         bigint generated always as identity primary key,
  user_id    uuid   not null references public.participants (id) on delete cascade,
  match_id   bigint not null references public.matches (id) on delete cascade,
  home_score int    not null check (home_score >= 0),
  away_score int    not null check (away_score >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, match_id)
);

create index bets_match_idx on public.bets (match_id);

alter table public.bets enable row level security;

-- REGRA ANTI-ESPIÃO: você sempre vê suas apostas;
-- as dos outros só ficam visíveis depois do início do jogo.
create policy "bets_select_own_or_started"
  on public.bets for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.matches m
      where m.id = bets.match_id
        and m.utc_date <= now()
    )
  );
-- Sem policy de insert/update: apostas só entram pela função submit_bets abaixo.

-- ------------------------------------------------------------
-- 4. LANÇAMENTOS (controle de "APOSTA LANÇADA" por dia)
-- ------------------------------------------------------------
create table public.submissions (
  user_id      uuid not null references public.participants (id) on delete cascade,
  bet_date     date not null,               -- data (horário de Brasília) dos jogos lançados
  submitted_at timestamptz not null default now(),
  primary key (user_id, bet_date)
);

alter table public.submissions enable row level security;

create policy "submissions_select_authenticated"
  on public.submissions for select
  to authenticated
  using (true);

-- ------------------------------------------------------------
-- 5. ESTADO DA SINCRONIZAÇÃO (throttle da Netlify Function)
-- ------------------------------------------------------------
create table public.sync_state (
  id        int primary key default 1 check (id = 1),
  last_sync timestamptz
);

insert into public.sync_state (id, last_sync) values (1, null);

alter table public.sync_state enable row level security;
-- Sem policies: só a service_role lê/escreve.

-- ------------------------------------------------------------
-- 6. RPC DE LANÇAMENTO DE APOSTAS (validação no servidor)
--    - rejeita se o jogo já começou (anti-fraude de relógio)
--    - rejeita se o dia já foi lançado
--    - grava todas as apostas + o lançamento numa transação só
-- ------------------------------------------------------------
create or replace function public.submit_bets(p_bets jsonb, p_bet_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b record;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado.';
  end if;

  if p_bets is null or jsonb_array_length(p_bets) = 0 then
    raise exception 'Nenhum palpite enviado.';
  end if;

  if exists (
    select 1 from public.submissions s
    where s.user_id = auth.uid() and s.bet_date = p_bet_date
  ) then
    raise exception 'Aposta já lançada para este dia.';
  end if;

  for b in
    select * from jsonb_to_recordset(p_bets)
      as x(match_id bigint, home_score int, away_score int)
  loop
    if b.match_id is null or b.home_score is null or b.away_score is null
       or b.home_score < 0 or b.away_score < 0 then
      raise exception 'Palpite inválido.';
    end if;

    if not exists (
      select 1 from public.matches m
      where m.id = b.match_id and m.utc_date > now()
    ) then
      raise exception 'Apostas encerradas: o jogo % já começou.', b.match_id;
    end if;

    insert into public.bets (user_id, match_id, home_score, away_score)
    values (auth.uid(), b.match_id, b.home_score, b.away_score)
    on conflict (user_id, match_id) do update
      set home_score = excluded.home_score,
          away_score = excluded.away_score,
          updated_at = now();
  end loop;

  insert into public.submissions (user_id, bet_date)
  values (auth.uid(), p_bet_date);
end;
$$;

revoke all on function public.submit_bets(jsonb, date) from public, anon;
grant execute on function public.submit_bets(jsonb, date) to authenticated;
