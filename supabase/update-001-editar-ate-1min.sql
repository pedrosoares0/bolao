-- ============================================================
-- ATUALIZAÇÃO 001 — Editar palpites até 1 minuto antes do jogo
--
-- ⚠️ RODE ESTE ARQUIVO no SQL Editor se você JÁ rodou o schema.sql
--    antes desta mudança (quem rodar o schema.sql novo não precisa).
--
-- O que muda:
--  - Lançar aposta não trava mais o dia: pode editar e relançar
--    quantas vezes quiser
--  - Cada jogo trava individualmente 1 minuto antes do kickoff
--    (validado com a hora do servidor)
-- ============================================================

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
      as x(match_id bigint, home_score int, away_score int)
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

    insert into public.bets (user_id, match_id, home_score, away_score)
    values (auth.uid(), b.match_id, b.home_score, b.away_score)
    on conflict (user_id, match_id) do update
      set home_score = excluded.home_score,
          away_score = excluded.away_score,
          updated_at = now();
  end loop;

  insert into public.submissions (user_id, bet_date)
  values (auth.uid(), p_bet_date)
  on conflict (user_id, bet_date) do update
    set submitted_at = now();
end;
$$;
