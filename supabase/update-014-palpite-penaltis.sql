-- ============================================================
-- UPDATE 014 — PALPITE DE PÊNALTIS (mata-mata)
-- Rode no Supabase: Dashboard > SQL Editor > New query
--
-- Novo palpite, só no mata-mata: o usuário marca se o jogo VAI pra disputa de
-- pênaltis (pens_pick) e, se marcar, quem VENCE a disputa (pens_winner: 'HOME'
-- ou 'AWAY'). Pontuação (ver utils/rules.pensBonus): só vale se o jogo de fato
-- foi a pênaltis — +1 por acertar que ia, +2 a mais pelo vencedor (máx 3).
-- ============================================================

-- 1. Colunas novas na tabela bets
ALTER TABLE public.bets
  ADD COLUMN IF NOT EXISTS pens_pick boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pens_winner text;

-- Garante apenas 'HOME'/'AWAY' (ou nulo) em pens_winner
ALTER TABLE public.bets DROP CONSTRAINT IF EXISTS bets_pens_winner_chk;
ALTER TABLE public.bets
  ADD CONSTRAINT bets_pens_winner_chk CHECK (pens_winner IS NULL OR pens_winner IN ('HOME', 'AWAY'));

-- 2. Atualiza submit_bets para processar pens_pick e pens_winner
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
      as x(match_id bigint, home_score int, away_score int, scorer_id text,
           pens_pick boolean, pens_winner text)
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

    insert into public.bets (user_id, match_id, home_score, away_score, scorer_id, pens_pick, pens_winner)
    values (
      auth.uid(), b.match_id, b.home_score, b.away_score, b.scorer_id,
      coalesce(b.pens_pick, false),
      case when coalesce(b.pens_pick, false) and b.pens_winner in ('HOME', 'AWAY') then b.pens_winner else null end
    )
    on conflict (user_id, match_id) do update
      set home_score = excluded.home_score,
          away_score = excluded.away_score,
          scorer_id = excluded.scorer_id,
          pens_pick = excluded.pens_pick,
          pens_winner = excluded.pens_winner,
          updated_at = now();
  end loop;

  insert into public.submissions (user_id, bet_date)
  values (auth.uid(), p_bet_date)
  on conflict (user_id, bet_date) do update
    set submitted_at = now();
end;
$$;
