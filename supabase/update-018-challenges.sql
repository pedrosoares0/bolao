-- ============================================================
-- UPDATE 018 — DESAFIO DOS MOLHADOS
-- Rode no Supabase: Dashboard > SQL Editor > New query
--
-- Dois participantes que escolheram CLASSIFICADOS DIFERENTES no mesmo jogo de
-- mata-mata podem se desafiar. Quem cravar o time que AVANÇA rouba 1 ponto do
-- outro (transferência de 1, igual à habilidade Ladrão).
--
-- Pontuação: aplicada em utils/rules.calculateStandings ao terminar o jogo.
-- Criação: via função Netlify create-challenge (valida os palpites + avisa no
-- WhatsApp). Resolução/“campeão”: avisada no fim do jogo (notify-core).
-- ============================================================

create table if not exists public.challenges (
  id              uuid primary key default gen_random_uuid(),
  match_id        bigint not null references public.matches (id) on delete cascade,
  challenger_id   uuid   not null references public.participants (id) on delete cascade,
  challenged_id   uuid   not null references public.participants (id) on delete cascade,
  challenger_pick text   not null check (challenger_pick in ('HOME', 'AWAY')),
  challenged_pick text   not null check (challenged_pick in ('HOME', 'AWAY')),
  -- pending = aguardando o desafiado; accepted = vale ponto; declined = recusado.
  status          text   not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at      timestamptz not null default now(),
  constraint challenge_no_self   check (challenger_id <> challenged_id),
  constraint challenge_diff_pick check (challenger_pick <> challenged_pick),
  -- No máximo um desafio por par/jogo (a direção reversa é barrada na função).
  unique (match_id, challenger_id, challenged_id)
);

alter table public.challenges enable row level security;

drop policy if exists challenges_select_authenticated on public.challenges;
create policy challenges_select_authenticated
  on public.challenges for select
  to authenticated
  using (true);

drop policy if exists challenges_insert_own on public.challenges;
create policy challenges_insert_own
  on public.challenges for insert
  to authenticated
  with check (challenger_id = auth.uid());

-- Tempo real (igual aos roubos do Ladrão). Ignora erro se já estiver na publicação.
do $$
begin
  alter publication supabase_realtime add table public.challenges;
exception when duplicate_object then null;
end $$;
