-- ============================================================
-- CRAVEI! — V2 MIGRATION 002: políticas do Storage
--
-- PASSO MANUAL ANTES DE RODAR:
--   Supabase Dashboard > Storage > New bucket
--     Nome:   media
--     Public: ON  (leitura pública das imagens)
--   Depois rode este arquivo no SQL Editor.
--
-- Convenção de caminho: TODO arquivo fica numa pasta com o uid do dono:
--   <uid>/avatar-<ts>.webp     (foto de perfil)
--   <uid>/card-<ts>.webp       (card de perfil)
--   <uid>/group-<groupId>-img-<ts>.webp   (imagem de grupo)
--   <uid>/group-<groupId>-card-<ts>.webp  (card de grupo)
-- A policy autoriza escrita só quando a 1ª pasta do caminho == auth.uid().
-- ============================================================

-- Leitura: pública (o bucket já é public; esta policy cobre acesso via API).
do $$ begin
  create policy "media_public_read"
    on storage.objects for select
    using (bucket_id = 'media');
exception when duplicate_object then null; end $$;

-- Escrita (insert/update/delete): só na própria pasta (1º segmento = uid).
do $$ begin
  create policy "media_insert_own"
    on storage.objects for insert to authenticated
    with check (
      bucket_id = 'media'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "media_update_own"
    on storage.objects for update to authenticated
    using (
      bucket_id = 'media'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "media_delete_own"
    on storage.objects for delete to authenticated
    using (
      bucket_id = 'media'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
exception when duplicate_object then null; end $$;
