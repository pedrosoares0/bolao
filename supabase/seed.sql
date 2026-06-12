-- ============================================================
-- BOLÃO BANDIDOS APOSTADOS — SEED (rodar DEPOIS do schema.sql)
--
-- ⚠️ ANTES DE RODAR: troque as 4 senhas abaixo (procure por TROQUE_).
--
-- Cria os 4 usuários no Supabase Auth com e-mails internos
-- (pedro@bolao.app etc). No app, cada um loga só com o NOME
-- (pedro / alex / rodrigo / neto) + a senha definida aqui.
--
-- Se este script der erro na sua versão do Supabase, crie os
-- usuários manualmente em: Dashboard > Authentication > Users >
-- "Add user" (e-mail nome@bolao.app, senha, marcar "Auto Confirm").
-- O trigger do schema cria o perfil em `participants` sozinho.
-- ============================================================

create or replace function public.bolao_create_user(p_username text, p_password text)
returns uuid
language plpgsql
security definer
as $$
declare
  v_uid   uuid := gen_random_uuid();
  v_email text := lower(p_username) || '@bolao.app';
begin
  if exists (select 1 from auth.users where email = v_email) then
    raise notice 'Usuário % já existe, pulando.', v_email;
    return null;
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_uid,
    'authenticated',
    'authenticated',
    v_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(), now(),
    '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(),
    v_uid,
    v_uid::text,
    jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true),
    'email',
    now(), now(), now()
  );

  return v_uid;
end;
$$;

-- ===============================================

drop function public.bolao_create_user(text, text);

-- Ajusta nomes de exibição e avatares (os arquivos já existem em /public/imagens)
update public.participants set name = 'Pedro',   avatar_url = '/imagens/pedro.png'   where username = 'pedro';
update public.participants set name = 'Alex',    avatar_url = '/imagens/alex.png'    where username = 'alex';
update public.participants set name = 'Rodrigo', avatar_url = '/imagens/rodrigo.png' where username = 'rodrigo';
update public.participants set name = 'Neto',    avatar_url = '/imagens/neto.png'    where username = 'neto';

-- Confere o resultado
select username, name, avatar_url from public.participants order by username;
