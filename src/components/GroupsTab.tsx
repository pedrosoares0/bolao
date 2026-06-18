// Aba de Grupos (Fase 2): lista os grupos do usuário, cria novos grupos,
// entra por código e abre o detalhe (membros, papéis, convites e ranking do
// grupo). Ranking do grupo = mesmas apostas, filtradas aos membros (Opção A).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Users, Share2, Copy, Crown, Shield, LogOut, ArrowLeft, Ban, Camera, Trophy } from 'lucide-react';
import type { Participant, Match, Bet, SpecialPrediction, Group, GroupMember, GroupInvite, Season, GroupRole } from '../types';
import { calculateStandings } from '../utils/rules';
import { uploadImage } from '../lib/storage';
import {
  listSeasons, listMyGroups, createGroup, listMembers, listInvites,
  createInvite, revokeInvite, redeemInvite, setMemberRole, setMemberStatus, leaveGroup,
} from '../lib/groups';

interface GroupsTabProps {
  currentUser: Participant;
  participants: Participant[];
  matches: Match[];
  bets: Bet[];
  specials: SpecialPrediction[];
  onToast: (message: string, type?: 'success' | 'error') => void;
}

const reais = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const ROLE_LABEL: Record<GroupRole, string> = { owner: 'Dono', admin: 'Admin', member: 'Participante' };

export const GroupsTab: React.FC<GroupsTabProps> = ({
  currentUser, participants, matches, bets, specials, onToast,
}) => {
  const uid = currentUser.uid!;
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list');
  const [groups, setGroups] = useState<Group[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Detalhe
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [invites, setInvites] = useState<GroupInvite[]>([]);

  // Entrar por código
  const [joinCode, setJoinCode] = useState('');

  // Form de criação
  const [form, setForm] = useState({
    name: '', description: '', seasonId: 0, visibility: 'private' as 'private' | 'public',
    fee: '', imageUrl: '' as string | null, cardUrl: '' as string | null,
  });
  const groupImgRef = useRef<HTMLInputElement>(null);
  const groupCardRef = useRef<HTMLInputElement>(null);
  const [imgUploading, setImgUploading] = useState<null | 'img' | 'card'>(null);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    try {
      setGroups(await listMyGroups(uid));
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Erro ao carregar grupos.');
    } finally {
      setLoading(false);
    }
  }, [uid, onToast]);

  useEffect(() => {
    loadGroups();
    listSeasons().then(setSeasons).catch(() => onToast('Erro ao carregar campeonatos.'));
  }, [loadGroups, onToast]);

  const selectedGroup = useMemo(
    () => groups.find((g) => g.id === selectedId) ?? null,
    [groups, selectedId]
  );
  const myRole = selectedGroup?.myRole;
  const isAdmin = myRole === 'owner' || myRole === 'admin';

  const openDetail = async (id: string) => {
    setSelectedId(id);
    setView('detail');
    try {
      const [m, inv] = await Promise.all([
        listMembers(id),
        listInvites(id).catch(() => [] as GroupInvite[]), // não-admin não vê convites
      ]);
      setMembers(m);
      setInvites(inv);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Erro ao abrir o grupo.');
    }
  };

  // Ranking do grupo: membros ativos × jogos da competição do grupo.
  // Specials (campeão/Brasil) só contam se a competição do grupo for a Copa.
  const groupStandings = useMemo(() => {
    if (view !== 'detail' || members.length === 0 || !selectedGroup) return [];
    const memberUsernames = new Set(
      members.filter((m) => m.status === 'active').map((m) => m.username)
    );
    const groupParticipants = participants.filter((p) => memberUsernames.has(p.id));
    const seasonMatches = selectedGroup.seasonId == null
      ? matches
      : matches.filter((m) => m.seasonId === selectedGroup.seasonId);
    const season = seasons.find((s) => s.id === selectedGroup.seasonId);
    const isCopa = !season || season.competitionProviderId === 'fifa.world';
    return calculateStandings(groupParticipants, seasonMatches, bets, isCopa ? specials : []);
  }, [view, members, participants, matches, bets, specials, selectedGroup, seasons]);

  // ---- Handlers de criação --------------------------------------------------
  const handleGroupImage = async (file: File | undefined, which: 'img' | 'card') => {
    if (!file) return;
    setImgUploading(which);
    try {
      const url = await uploadImage(file, uid, which === 'img' ? 'group-img' : 'group-card');
      setForm((f) => (which === 'img' ? { ...f, imageUrl: url } : { ...f, cardUrl: url }));
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Falha no upload.');
    } finally {
      setImgUploading(null);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.name.trim().length < 2) { onToast('Dê um nome ao grupo.'); return; }
    if (!form.seasonId) { onToast('Escolha o campeonato.'); return; }
    const feeCents = Math.round(parseFloat(form.fee.replace(',', '.') || '0') * 100);
    if (Number.isNaN(feeCents) || feeCents < 0) { onToast('Valor inválido.'); return; }

    setBusy(true);
    try {
      const id = await createGroup({
        name: form.name.trim(), description: form.description.trim(),
        seasonId: form.seasonId, visibility: form.visibility, entryFeeCents: feeCents,
        imageUrl: form.imageUrl || null, cardUrl: form.cardUrl || null,
      });
      onToast('Grupo criado!', 'success');
      setForm({ name: '', description: '', seasonId: 0, visibility: 'private', fee: '', imageUrl: '', cardUrl: '' });
      await loadGroups();
      await openDetail(id);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Não foi possível criar o grupo.');
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) { onToast('Digite o código do convite.'); return; }
    setBusy(true);
    try {
      const gid = await redeemInvite(joinCode);
      onToast('Você entrou no grupo!', 'success');
      setJoinCode('');
      await loadGroups();
      await openDetail(gid);
    } catch {
      onToast('Convite inválido ou expirado.');
    } finally {
      setBusy(false);
    }
  };

  // ---- Handlers de detalhe --------------------------------------------------
  const refreshDetail = async (id: string) => {
    const [m, inv] = await Promise.all([listMembers(id), listInvites(id).catch(() => [])]);
    setMembers(m); setInvites(inv as GroupInvite[]);
  };

  const handleNewInvite = async () => {
    if (!selectedId) return;
    setBusy(true);
    try {
      await createInvite(selectedId, uid);
      await refreshDetail(selectedId);
      onToast('Convite gerado!', 'success');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Erro ao gerar convite.');
    } finally {
      setBusy(false);
    }
  };

  const shareInvite = async (code: string) => {
    const link = `${window.location.origin}/?invite=${code}`;
    const text = `Entra no meu bolão no Cravei! Código: ${code}\n${link}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Cravei!', text }); return; } catch { /* cancelou */ }
    }
    await navigator.clipboard.writeText(text);
    onToast('Convite copiado!', 'success');
  };

  const copyCode = async (code: string) => {
    await navigator.clipboard.writeText(code);
    onToast('Código copiado!', 'success');
  };

  const changeRole = async (m: GroupMember, role: GroupRole) => {
    if (!selectedId) return;
    try {
      await setMemberRole(selectedId, m.userId, role);
      await refreshDetail(selectedId);
    } catch (err) { onToast(err instanceof Error ? err.message : 'Erro ao alterar papel.'); }
  };

  const banMember = async (m: GroupMember) => {
    if (!selectedId) return;
    try {
      await setMemberStatus(selectedId, m.userId, 'banned');
      await refreshDetail(selectedId);
      onToast('Membro removido.', 'success');
    } catch (err) { onToast(err instanceof Error ? err.message : 'Erro ao remover.'); }
  };

  const handleLeave = async () => {
    if (!selectedId) return;
    setBusy(true);
    try {
      await leaveGroup(selectedId, uid);
      onToast('Você saiu do grupo.', 'success');
      setView('list');
      setSelectedId(null);
      await loadGroups();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Erro ao sair.');
    } finally {
      setBusy(false);
    }
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================
  if (view === 'create') {
    return (
      <div className="groups-container">
        <button className="groups-back-btn" onClick={() => setView('list')}>
          <ArrowLeft size={16} /> Voltar
        </button>
        <h2 className="groups-title">Novo grupo</h2>

        <input ref={groupImgRef} type="file" accept="image/*" hidden
          onChange={(e) => { handleGroupImage(e.target.files?.[0], 'img'); e.target.value = ''; }} />
        <input ref={groupCardRef} type="file" accept="image/*" hidden
          onChange={(e) => { handleGroupImage(e.target.files?.[0], 'card'); e.target.value = ''; }} />

        <form onSubmit={handleCreate} className="groups-form">
          <div className="groups-cover-edit" style={form.cardUrl ? { backgroundImage: `url(${form.cardUrl})` } : undefined}>
            <div className="groups-avatar-edit" onClick={() => groupImgRef.current?.click()}>
              {form.imageUrl
                ? <img src={form.imageUrl} alt="Imagem do grupo" />
                : <Users size={28} />}
              <span className="groups-avatar-cam"><Camera size={12} /></span>
            </div>
            <button type="button" className="groups-cover-btn" onClick={() => groupCardRef.current?.click()}>
              <Camera size={12} /> {imgUploading === 'card' ? 'Enviando…' : 'Capa'}
            </button>
          </div>

          <label className="groups-label">Nome do grupo</label>
          <input className="groups-input" value={form.name} maxLength={60}
            onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Bolão da firma" />

          <label className="groups-label">Descrição</label>
          <textarea className="groups-input" value={form.description} maxLength={500} rows={3}
            onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Regras, combinados, etc." />

          <label className="groups-label">Campeonato</label>
          <select className="groups-input" value={form.seasonId}
            onChange={(e) => setForm({ ...form, seasonId: Number(e.target.value) })}>
            <option value={0}>Selecione…</option>
            {seasons.map((s) => <option key={s.id} value={s.id}>{s.competitionName}</option>)}
          </select>

          <div className="groups-row-2">
            <div>
              <label className="groups-label">Valor por rodada (R$)</label>
              <input className="groups-input" inputMode="decimal" value={form.fee}
                onChange={(e) => setForm({ ...form, fee: e.target.value })} placeholder="0,00" />
            </div>
            <div>
              <label className="groups-label">Visibilidade</label>
              <select className="groups-input" value={form.visibility}
                onChange={(e) => setForm({ ...form, visibility: e.target.value as 'private' | 'public' })}>
                <option value="private">Privado (só por convite)</option>
                <option value="public">Público</option>
              </select>
            </div>
          </div>

          <button type="submit" className="groups-primary-btn" disabled={busy || imgUploading !== null}>
            {busy ? 'Criando…' : 'Criar grupo'}
          </button>
        </form>
      </div>
    );
  }

  if (view === 'detail' && selectedGroup) {
    const g = selectedGroup;
    return (
      <div className="groups-container">
        <button className="groups-back-btn" onClick={() => { setView('list'); setSelectedId(null); }}>
          <ArrowLeft size={16} /> Meus grupos
        </button>

        <div className="group-detail-header" style={g.cardUrl ? { backgroundImage: `url(${g.cardUrl})` } : undefined}>
          <div className="group-detail-avatar">
            {g.imageUrl ? <img src={g.imageUrl} alt={g.name} /> : <Users size={26} />}
          </div>
          <div className="group-detail-headtext">
            <h2>{g.name}</h2>
            <span className="group-detail-sub">
              {g.seasonLabel ?? 'Campeonato'} · {g.memberCount ?? members.length} membros
              {g.entryFeeCents > 0 && ` · ${reais(g.entryFeeCents)}/rodada`}
            </span>
          </div>
        </div>

        {g.description && <p className="group-detail-desc">{g.description}</p>}

        {/* CONVITES (admin) */}
        {isAdmin && (
          <section className="group-section">
            <div className="group-section-head">
              <h3><Share2 size={15} /> Convites</h3>
              <button className="groups-mini-btn" onClick={handleNewInvite} disabled={busy}>
                <Plus size={14} /> Gerar
              </button>
            </div>
            {invites.length === 0
              ? <p className="group-empty">Nenhum convite ativo. Gere um para compartilhar.</p>
              : invites.map((inv) => (
                <div key={inv.id} className="group-invite-row">
                  <code className="group-invite-code">{inv.code}</code>
                  <div className="group-invite-actions">
                    <button onClick={() => copyCode(inv.code)} aria-label="Copiar código"><Copy size={15} /></button>
                    <button onClick={() => shareInvite(inv.code)} aria-label="Compartilhar"><Share2 size={15} /></button>
                    <button onClick={async () => { await revokeInvite(inv.id); await refreshDetail(g.id); }} className="group-invite-revoke">Revogar</button>
                  </div>
                </div>
              ))}
          </section>
        )}

        {/* RANKING DO GRUPO */}
        <section className="group-section">
          <h3><Trophy size={15} /> Ranking do grupo</h3>
          {groupStandings.length === 0
            ? <p className="group-empty">Sem pontuação ainda.</p>
            : groupStandings.map((s, i) => (
              <div key={s.participantId} className="group-rank-row">
                <span className="group-rank-pos">{i + 1}º</span>
                <span className="group-rank-name">{s.name}</span>
                <span className="group-rank-pts">{s.points} pts</span>
              </div>
            ))}
        </section>

        {/* MEMBROS */}
        <section className="group-section">
          <h3><Users size={15} /> Membros</h3>
          {members.filter((m) => m.status === 'active').map((m) => (
            <div key={m.userId} className="group-member-row">
              <div className="group-member-info">
                <span className="group-member-name">{m.name ?? m.username}</span>
                <span className={`group-role-badge role-${m.role}`}>
                  {m.role === 'owner' && <Crown size={11} />}
                  {m.role === 'admin' && <Shield size={11} />}
                  {ROLE_LABEL[m.role]}
                </span>
              </div>
              {/* Ações de admin sobre os demais (não sobre o dono, nem sobre si quando dono) */}
              {isAdmin && m.userId !== uid && m.role !== 'owner' && (
                <div className="group-member-actions">
                  {myRole === 'owner' && (
                    m.role === 'admin'
                      ? <button onClick={() => changeRole(m, 'member')} title="Rebaixar a participante"><Shield size={14} /></button>
                      : <button onClick={() => changeRole(m, 'admin')} title="Promover a admin"><Shield size={14} /></button>
                  )}
                  <button onClick={() => banMember(m)} title="Remover do grupo" className="group-ban-btn"><Ban size={14} /></button>
                </div>
              )}
            </div>
          ))}
        </section>

        {myRole !== 'owner' && (
          <button className="groups-leave-btn" onClick={handleLeave} disabled={busy}>
            <LogOut size={15} /> Sair do grupo
          </button>
        )}
      </div>
    );
  }

  // view === 'list'
  return (
    <div className="groups-container">
      <div className="groups-list-head">
        <h2 className="groups-title">Meus grupos</h2>
        <button className="groups-primary-btn small" onClick={() => setView('create')}>
          <Plus size={16} /> Criar
        </button>
      </div>

      <form onSubmit={handleJoin} className="groups-join-row">
        <input className="groups-input" value={joinCode} maxLength={10}
          onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="Código do convite" />
        <button type="submit" className="groups-mini-btn" disabled={busy}>Entrar</button>
      </form>

      {loading ? (
        <p className="group-empty">Carregando grupos…</p>
      ) : groups.length === 0 ? (
        <div className="groups-empty-state">
          <Users size={40} />
          <p>Você ainda não está em nenhum grupo.</p>
          <span>Crie um grupo ou entre com um código de convite.</span>
        </div>
      ) : (
        <div className="groups-cards">
          {groups.map((g) => (
            <button key={g.id} className="group-card" onClick={() => openDetail(g.id)}
              style={g.cardUrl ? { backgroundImage: `linear-gradient(rgba(13,10,8,0.7),rgba(13,10,8,0.85)), url(${g.cardUrl})` } : undefined}>
              <div className="group-card-avatar">
                {g.imageUrl ? <img src={g.imageUrl} alt={g.name} /> : <Users size={22} />}
              </div>
              <div className="group-card-text">
                <span className="group-card-name">{g.name}</span>
                <span className="group-card-sub">{g.seasonLabel ?? 'Campeonato'} · {g.memberCount ?? 1} membros</span>
              </div>
              <span className={`group-role-badge role-${g.myRole ?? 'member'}`}>
                {g.myRole === 'owner' && <Crown size={11} />}
                {g.myRole === 'admin' && <Shield size={11} />}
                {ROLE_LABEL[g.myRole ?? 'member']}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default GroupsTab;
