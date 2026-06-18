-- ============================================================
-- UPDATE 009 — ADICIONA ARTILHEIRO (JOGOS DO BRASIL)
-- Rode este arquivo no Supabase: Dashboard > SQL Editor > New query
-- ============================================================

-- 1. Adiciona a coluna scorer_id na tabela bets
ALTER TABLE public.bets ADD COLUMN IF NOT EXISTS scorer_id text;

-- 2. Atualiza a função submit_bets para processar scorer_id
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

  for b in
    select * from jsonb_to_recordset(p_bets)
      as x(match_id bigint, home_score int, away_score int, scorer_id text)
  loop
    if b.match_id is null or b.home_score is null or b.away_score is null
       or b.home_score < 0 or b.away_score < 0 then
      raise exception 'Palpite inválido.';
    end if;

    -- Pode apostar/editar até 1 minuto antes do início do jogo
    if not exists (
      select 1 from public.matches m
      where m.id = b.match_id
        and m.utc_date - interval '1 minute' > now()
    ) then
      raise exception 'Apostas encerradas para o jogo %.', b.match_id;
    end if;

    insert into public.bets (user_id, match_id, home_score, away_score, scorer_id)
    values (auth.uid(), b.match_id, b.home_score, b.away_score, b.scorer_id)
    on conflict (user_id, match_id) do update
      set home_score = excluded.home_score,
          away_score = excluded.away_score,
          scorer_id = excluded.scorer_id,
          updated_at = now();
  end loop;

  insert into public.submissions (user_id, bet_date)
  values (auth.uid(), p_bet_date)
  on conflict (user_id, bet_date) do update
    set submitted_at = now();
end;
$$;
