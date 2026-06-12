-- ============================================================
-- ATUALIZAÇÃO 002 — Imagens convertidas para WebP
--
-- ⚠️ RODE ESTE ARQUIVO no SQL Editor se você JÁ rodou o seed.sql
--    antes desta mudança: os avatares no banco apontavam para
--    arquivos .png que não existem mais (viraram .webp).
-- ============================================================

update public.participants
set avatar_url = replace(avatar_url, '.png', '.webp')
where avatar_url like '%.png';

-- Confere o resultado
select username, avatar_url from public.participants order by username;
