// API de grupos (Fase 2) — opera no dataset isolado da branch (_escalavel, ver
// lib/tables.ts). Respeita o RLS: o usuário só enxerga grupos a que pertence
// (ou públicos) e só admin gerencia membros/convites. Operações críticas usam
// RPCs transacionais.
import { supabase } from './supabase';
import { T, RPC } from './tables';
import type { Group, GroupMember, GroupInvite, GroupRole, Season } from '../types';

// ---- Catálogo -------------------------------------------------------------
// Sem embeds do PostgREST (que não resolvem relação de forma confiável nas
// tabelas novas): buscamos seasons e competitions e juntamos no cliente.
interface CompRow { id: number; name: string; provider_id: string | null }
interface SeasonRow { id: number; competition_id: number; name: string }

export async function listSeasons(): Promise<Season[]> {
  const [seasonsRes, compsRes] = await Promise.all([
    supabase.from(T.seasons).select('id, competition_id, name').order('id'),
    supabase.from(T.competitions).select('id, name, provider_id'),
  ]);
  if (seasonsRes.error) throw new Error(seasonsRes.error.message);
  if (compsRes.error) throw new Error(compsRes.error.message);

  const comps = new Map<number, CompRow>(
    ((compsRes.data as CompRow[]) ?? []).map((c) => [c.id, c])
  );
  return ((seasonsRes.data as SeasonRow[]) ?? []).map((s) => {
    const c = comps.get(s.competition_id);
    return {
      id: s.id,
      competitionId: s.competition_id,
      name: s.name,
      competitionName: `${c?.name ?? 'Competição'} ${s.name}`.trim(),
      competitionProviderId: c?.provider_id ?? null,
    };
  });
}

// ---- Grupos do usuário ----------------------------------------------------
interface RawGroup {
  id: string; owner_id: string; season_id: number | null; name: string;
  description: string | null; image_url: string | null; card_url: string | null;
  visibility: 'private' | 'public'; entry_fee_cents: number; member_limit: number | null;
  status: 'active' | 'closed' | 'archived';
  pix_key: string | null; pix_recipient: string | null; pix_bank: string | null;
  season?: { name: string; competition?: { name: string } | null } | null;
}

const mapGroup = (g: RawGroup): Group => ({
  id: g.id, ownerId: g.owner_id, seasonId: g.season_id, name: g.name,
  description: g.description, imageUrl: g.image_url, cardUrl: g.card_url,
  visibility: g.visibility, entryFeeCents: g.entry_fee_cents,
  memberLimit: g.member_limit, status: g.status,
  pixKey: g.pix_key, pixRecipient: g.pix_recipient, pixBank: g.pix_bank,
  seasonLabel: g.season
    ? `${g.season.competition?.name ?? ''} ${g.season.name}`.trim()
    : undefined,
});

export async function listMyGroups(uid: string): Promise<Group[]> {
  // 1) minhas associações
  const { data: mems, error } = await supabase
    .from(T.groupMembers)
    .select('role, group_id')
    .eq('user_id', uid)
    .eq('status', 'active');
  if (error) throw new Error(error.message);

  const ids = (mems ?? []).map((m) => m.group_id as string);
  if (ids.length === 0) return [];
  const roleByGroup = new Map<string, GroupRole>(
    (mems ?? []).map((m) => [m.group_id as string, m.role as GroupRole])
  );

  // 2) grupos + rótulos de temporada + contagem de membros (sem embeds)
  const [groupsRes, seasonsList, countsRes] = await Promise.all([
    supabase.from(T.groups).select('*').in('id', ids),
    listSeasons().catch(() => [] as Season[]),
    supabase.from(T.groupMembers).select('group_id').in('group_id', ids).eq('status', 'active'),
  ]);
  if (groupsRes.error) throw new Error(groupsRes.error.message);

  const seasonById = new Map<number, Season>(seasonsList.map((s) => [s.id, s]));
  const tally = new Map<string, number>();
  (countsRes.data ?? []).forEach((c) => tally.set(c.group_id, (tally.get(c.group_id) ?? 0) + 1));

  return ((groupsRes.data as unknown as RawGroup[]) ?? []).map((g) => {
    const mapped = mapGroup(g);
    mapped.myRole = roleByGroup.get(g.id);
    mapped.memberCount = tally.get(g.id) ?? 1;
    mapped.seasonLabel = g.season_id != null ? seasonById.get(g.season_id)?.competitionName : undefined;
    return mapped;
  });
}

export interface CreateGroupInput {
  name: string; description: string; seasonId: number;
  visibility: 'private' | 'public'; entryFeeCents: number;
  imageUrl?: string | null; cardUrl?: string | null; memberLimit?: number | null;
  pixKey?: string | null; pixRecipient?: string | null; pixBank?: string | null;
}

export async function createGroup(input: CreateGroupInput): Promise<string> {
  const { data, error } = await supabase.rpc(RPC.createGroup, {
    p_name: input.name,
    p_description: input.description || null,
    p_season_id: input.seasonId,
    p_visibility: input.visibility,
    p_entry_fee_cents: input.entryFeeCents,
    p_image_url: input.imageUrl ?? null,
    p_card_url: input.cardUrl ?? null,
    p_member_limit: input.memberLimit ?? null,
    p_pix_key: input.pixKey ?? null,
    p_pix_recipient: input.pixRecipient ?? null,
    p_pix_bank: input.pixBank ?? null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function deleteGroup(groupId: string): Promise<void> {
  // RLS: só o dono (owner_id = auth.uid()) consegue apagar.
  const { error } = await supabase.from(T.groups).delete().eq('id', groupId);
  if (error) throw new Error(error.message);
}

export async function updateGroup(groupId: string, patch: Partial<{
  name: string; description: string | null; image_url: string | null;
  card_url: string | null; visibility: string; entry_fee_cents: number;
  member_limit: number | null; status: string;
  pix_key: string | null; pix_recipient: string | null; pix_bank: string | null;
}>): Promise<void> {
  const { error } = await supabase.from(T.groups).update(patch).eq('id', groupId);
  if (error) throw new Error(error.message);
}

// ---- Membros --------------------------------------------------------------
export async function listMembers(groupId: string): Promise<GroupMember[]> {
  const { data: mems, error } = await supabase
    .from(T.groupMembers)
    .select('group_id, user_id, role, status, joined_at')
    .eq('group_id', groupId)
    .order('role');
  if (error) throw new Error(error.message);

  const ids = (mems ?? []).map((m) => m.user_id as string);
  const profById = new Map<string, { username?: string; name?: string; avatar_url?: string }>();
  if (ids.length) {
    const { data: profs } = await supabase
      .from(T.participants).select('id, username, name, avatar_url').in('id', ids);
    (profs ?? []).forEach((p) => profById.set(p.id as string, p));
  }
  return (mems ?? []).map((m) => {
    const p = profById.get(m.user_id as string);
    return {
      groupId: m.group_id as string, userId: m.user_id as string, role: m.role as GroupRole,
      status: m.status as GroupMember['status'], joinedAt: m.joined_at as string,
      username: p?.username, name: p?.name, avatarUrl: p?.avatar_url,
    };
  });
}

export async function setMemberRole(groupId: string, userId: string, role: GroupRole): Promise<void> {
  const { error } = await supabase.from(T.groupMembers)
    .update({ role }).eq('group_id', groupId).eq('user_id', userId);
  if (error) throw new Error(error.message);
}

export async function setMemberStatus(groupId: string, userId: string, status: 'active' | 'banned'): Promise<void> {
  const { error } = await supabase.from(T.groupMembers)
    .update({ status }).eq('group_id', groupId).eq('user_id', userId);
  if (error) throw new Error(error.message);
}

export async function leaveGroup(groupId: string, uid: string): Promise<void> {
  const { error } = await supabase.from(T.groupMembers)
    .delete().eq('group_id', groupId).eq('user_id', uid);
  if (error) throw new Error(error.message);
}

// ---- Convites -------------------------------------------------------------
async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomCode(len = 6): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

export async function createInvite(groupId: string, uid: string): Promise<GroupInvite> {
  const code = randomCode();
  const tokenHash = await sha256Hex(`${code}:${crypto.randomUUID()}`);
  const { data, error } = await supabase.from(T.groupInvites).insert({
    group_id: groupId, code, token_hash: tokenHash, created_by: uid,
  }).select('id, group_id, code, expires_at, max_uses, uses, status').single();
  if (error) throw new Error(error.message);
  return {
    id: data.id, groupId: data.group_id, code: data.code, expiresAt: data.expires_at,
    maxUses: data.max_uses, uses: data.uses, status: data.status,
  };
}

export async function listInvites(groupId: string): Promise<GroupInvite[]> {
  const { data, error } = await supabase
    .from(T.groupInvites)
    .select('id, group_id, code, expires_at, max_uses, uses, status')
    .eq('group_id', groupId).eq('status', 'active')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((d) => ({
    id: d.id, groupId: d.group_id, code: d.code, expiresAt: d.expires_at,
    maxUses: d.max_uses, uses: d.uses, status: d.status,
  }));
}

export async function revokeInvite(inviteId: string): Promise<void> {
  const { error } = await supabase.from(T.groupInvites)
    .update({ status: 'revoked' }).eq('id', inviteId);
  if (error) throw new Error(error.message);
}

export async function redeemInvite(code: string): Promise<string> {
  const { data, error } = await supabase.rpc(RPC.redeemInvite, { p_code: code.trim().toUpperCase() });
  if (error) throw new Error(error.message);
  return data as string;
}
