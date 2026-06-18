-- ============================================================
-- CRAVEI! — RESET LIMPO do dataset _escalavel
-- Remove TODOS os grupos e TODOS os usuários, exceto o 'weber'.
-- Mantém jogos/competições/temporadas (infra pra apostar e criar grupos).
--
-- Rode no SQL Editor do projeto da branch. É seguro: só mexe nas tabelas
-- _escalavel; a main continua intacta.
-- ============================================================

begin;

-- 1. Apaga todos os grupos (cascata: membros, convites, pagamentos).
delete from public.groups_escalavel;

-- 2. Apaga todos os usuários menos 'weber' (cascata: apostas, lançamentos,
--    palpites especiais, fiados, notificações daqueles usuários).
delete from public.participants_escalavel where username <> 'weber';

-- 3. Zera tentativas de convite e auditoria órfãs (opcional, deixa tudo limpo).
delete from public.invite_attempts_escalavel;
delete from public.audit_logs_escalavel;

commit;

-- Sobra: matches_escalavel (jogos da Copa), competitions/seasons/rulesets e,
-- se existir, o usuário 'weber'. Nenhum grupo. Crie os grupos pelo app.
--
-- Se NÃO existir um usuário 'weber' ainda, a tabela de participantes fica vazia
-- até você se cadastrar pelo app. (Se o seu username não for exatamente 'weber',
-- me avise para ajustar o filtro.)
--
-- Quer um banco 100% vazio (sem nem os jogos da Copa)? rode também:
--   -- delete from public.matches_escalavel;
