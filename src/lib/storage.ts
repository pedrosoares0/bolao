// Upload de imagens para o Supabase Storage (bucket público `media`).
// Convenção de caminho: `<uid>/<arquivo>` — a policy de Storage só deixa o dono
// escrever na própria pasta (ver supabase/v2-002-storage.sql).
//
// Antes de enviar, a imagem é redimensionada e convertida para WebP no próprio
// navegador, mantendo o storage leve (mesma convenção do update-002-imagens-webp).
import { supabase } from './supabase';

const BUCKET = 'media';

// Redimensiona mantendo proporção (lado maior <= maxSize) e devolve um Blob WebP.
async function toWebp(file: File, maxSize: number, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponível.');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Falha ao converter imagem.'))),
      'image/webp',
      quality
    )
  );
}

export type ImageKind = 'avatar' | 'card' | 'group-img' | 'group-card';

const MAX_SIZE: Record<ImageKind, number> = {
  avatar: 512,
  card: 1080,
  'group-img': 512,
  'group-card': 1080,
};

/**
 * Envia uma imagem e devolve a URL pública.
 * @param uid    dono (pasta de destino) — precisa ser o auth.uid() logado.
 * @param kind   tipo da imagem (define o tamanho máximo e o prefixo do nome).
 * @param suffix sufixo opcional (ex.: id do grupo) para nomes únicos por entidade.
 */
export async function uploadImage(
  file: File,
  uid: string,
  kind: ImageKind,
  suffix = ''
): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Selecione um arquivo de imagem.');
  if (file.size > 15 * 1024 * 1024) throw new Error('Imagem muito grande (máx. 15 MB).');

  const webp = await toWebp(file, MAX_SIZE[kind]);
  const tag = suffix ? `${kind}-${suffix}` : kind;
  const path = `${uid}/${tag}-${Date.now()}.webp`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, webp, {
    contentType: 'image/webp',
    upsert: true,
  });
  if (error) throw new Error(error.message);

  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
