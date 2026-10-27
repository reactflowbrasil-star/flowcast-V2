'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, Loader2, Pencil, Plus, Trash2, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { viewerProfilesService } from '@/services/viewerProfiles';
import { getViewerProfileStorageKey, PROFILE_AVATARS, PROFILE_COVERS, VIEWER_GENRES, type ViewerProfile, type ViewerProfileInput } from '@/lib/viewerProfiles';

type Props = { onActiveProfileChange?: (profile: ViewerProfile | null) => void };

const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Não foi possível salvar o perfil.';

export default function ViewerProfilesControl({ onActiveProfileChange }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id;
  const queryKey = ['viewer-profiles', userId];
  const [activeId, setActiveId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<ViewerProfileInput>({ name: '', avatar: PROFILE_AVATARS[0], cover: 'violet', favorite_genres: [], is_kids: false });
  const [error, setError] = useState('');

  const profilesQuery = useQuery({
    queryKey,
    enabled: !!userId,
    queryFn: async () => {
      const result = await viewerProfilesService.list();
      if (!result.success || !result.data) throw new Error(result.error?.error || 'Não foi possível carregar perfis.');
      return result.data;
    },
  });
  const profiles = profilesQuery.data ?? [];
  const activeProfile = useMemo(() => profiles.find((profile) => profile.id === activeId) ?? profiles[0] ?? null, [profiles, activeId]);
  const pendingPreferencesApplied = useRef(false);

  useEffect(() => {
    if (!userId || profiles.length === 0) return;
    let storedId: number | null = null;
    try {
      const parsed = Number(window.localStorage.getItem(getViewerProfileStorageKey(userId)));
      if (Number.isFinite(parsed) && profiles.some((profile) => profile.id === parsed)) storedId = parsed;
    } catch { /* private browsing may block storage */ }
    const nextId = storedId ?? profiles[0].id;
    setActiveId(nextId);
    onActiveProfileChange?.(profiles.find((profile) => profile.id === nextId) ?? profiles[0]);
  }, [userId, profiles, onActiveProfileChange]);

  useEffect(() => {
    if (!user?.email || profiles.length === 0 || pendingPreferencesApplied.current) return;
    const storageKey = `flowcast-pending-genres:${user.email.trim().toLowerCase()}`;
    try {
      const pendingGenres = JSON.parse(window.localStorage.getItem(storageKey) || 'null');
      if (!Array.isArray(pendingGenres) || pendingGenres.length === 0) return;
      if (profiles[0].favorite_genres.length > 0) {
        window.localStorage.removeItem(storageKey);
        pendingPreferencesApplied.current = true;
        return;
      }
      pendingPreferencesApplied.current = true;
      const profile = profiles[0];
      viewerProfilesService.update(profile.id, {
        name: profile.name,
        avatar: profile.avatar,
        cover: profile.cover,
        is_kids: profile.is_kids,
        favorite_genres: pendingGenres.filter((genre): genre is string => typeof genre === 'string').slice(0, 20),
      }).then((result) => {
        if (!result.success || !result.data) return;
        window.localStorage.removeItem(storageKey);
        queryClient.setQueryData<ViewerProfile[]>(queryKey, (current = []) => current.map((item) => item.id === result.data!.id ? result.data! : item));
      }).catch(() => { pendingPreferencesApplied.current = false; });
    } catch { /* ignore an invalid local preference payload */ }
  }, [profiles, user?.email, userId, queryClient]);

  const selectProfile = (profile: ViewerProfile) => {
    setActiveId(profile.id);
    try { if (userId) window.localStorage.setItem(getViewerProfileStorageKey(userId), String(profile.id)); } catch { /* profile still works for this session */ }
    onActiveProfileChange?.(profile);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const result = editingId
        ? await viewerProfilesService.update(editingId, draft)
        : await viewerProfilesService.create(draft);
      if (!result.success || !result.data) throw new Error(result.error?.error || 'Não foi possível salvar o perfil.');
      return result.data;
    },
    onSuccess: (profile) => {
      queryClient.setQueryData<ViewerProfile[]>(queryKey, (current = []) => {
        const existing = current.some((item) => item.id === profile.id);
        return existing ? current.map((item) => item.id === profile.id ? profile : item) : [...current, profile];
      });
      selectProfile(profile);
      setEditingId(null);
      setShowForm(false);
      setError('');
    },
    onError: (cause) => setError(errorMessage(cause)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (profileId: number) => {
      const result = await viewerProfilesService.delete(profileId);
      if (!result.success) throw new Error(result.error?.error || 'Não foi possível excluir o perfil.');
      return profileId;
    },
    onSuccess: (profileId) => {
      const nextProfiles = profiles.filter((profile) => profile.id !== profileId);
      queryClient.setQueryData<ViewerProfile[]>(queryKey, nextProfiles);
      if (profileId === activeId && nextProfiles[0]) selectProfile(nextProfiles[0]);
      setEditingId(null);
      setError('');
    },
    onError: (cause) => setError(errorMessage(cause)),
  });

  const startCreate = () => {
    setEditingId(null);
    setShowForm(true);
    setDraft({ name: '', avatar: PROFILE_AVATARS[0], cover: 'violet', favorite_genres: [], is_kids: false });
    setError('');
  };

  const startEdit = (profile: ViewerProfile) => {
    setEditingId(profile.id);
    setShowForm(true);
    setDraft({ name: profile.name, avatar: profile.avatar, cover: profile.cover, favorite_genres: profile.favorite_genres, is_kids: profile.is_kids });
    setError('');
  };

  const toggleGenre = (genre: string) => {
    const current = draft.favorite_genres ?? [];
    setDraft({ ...draft, favorite_genres: current.includes(genre) ? current.filter((item) => item !== genre) : [...current, genre] });
  };

  if (!userId) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/45 py-1.5 pl-1.5 pr-3 text-left text-white shadow-lg backdrop-blur transition duration-300 hover:border-white/25 hover:bg-white/10"
        aria-label="Trocar perfil ou gerenciar perfis"
      >
        {profilesQuery.isLoading ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : (
          <span className={`flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br ${PROFILE_COVERS[activeProfile?.cover || 'violet']} text-xl ring-2 ring-white/20`}>
            {activeProfile?.avatar || '🍿'}
          </span>
        )}
        <span className="max-w-28 truncate text-sm font-semibold">{activeProfile?.name || 'Perfis'}</span>
        <ChevronDown className="h-4 w-4 text-white/60 transition-transform group-hover:translate-y-0.5" />
      </button>

      <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) { setEditingId(null); setShowForm(false); setError(''); } }}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto border-white/10 bg-[#10131b] text-white">
          <DialogHeader>
            <DialogTitle>{editingId || draft.name ? 'Editar perfil' : 'Quem está assistindo?'}</DialogTitle>
            <DialogDescription className="text-slate-400">
              Cada perfil guarda seus gêneros favoritos e recomendações separadas.
            </DialogDescription>
          </DialogHeader>

          {showForm ? (
            <div className="space-y-5">
              <div className={`relative h-28 overflow-hidden rounded-2xl bg-gradient-to-r ${PROFILE_COVERS[draft.cover || 'violet']}`}>
                <div className="absolute inset-0 bg-black/15" />
                <div className="absolute bottom-3 left-4 flex h-16 w-16 items-center justify-center rounded-full border-4 border-[#10131b] bg-slate-950/60 text-3xl shadow-xl">
                  {draft.avatar || '🍿'}
                </div>
              </div>

              <label className="block space-y-2 text-sm font-medium">
                Nome do perfil
                <Input value={draft.name} maxLength={40} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Ex.: Família" className="border-white/10 bg-white/5 text-white" />
              </label>

              <div className="space-y-2">
                <p className="text-sm font-medium">Avatar</p>
                <div className="flex flex-wrap gap-2">
                  {PROFILE_AVATARS.map((avatar) => (
                    <button key={avatar} type="button" aria-label={`Avatar ${avatar}`} onClick={() => setDraft({ ...draft, avatar })} className={`flex h-11 w-11 items-center justify-center rounded-full border text-xl transition duration-200 hover:scale-110 ${draft.avatar === avatar ? 'border-cyan-400 bg-cyan-400/15 ring-2 ring-cyan-400/30' : 'border-white/10 bg-white/5'}`}>
                      {avatar}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Capa do perfil</p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {Object.entries(PROFILE_COVERS).map(([cover, gradient]) => (
                    <button key={cover} type="button" aria-label={`Capa ${cover}`} onClick={() => setDraft({ ...draft, cover })} className={`h-12 rounded-lg bg-gradient-to-r ${gradient} transition duration-200 hover:scale-[1.03] ${draft.cover === cover ? 'ring-2 ring-white ring-offset-2 ring-offset-[#10131b]' : 'opacity-75'}`} />
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Gêneros favoritos</p>
                <div className="flex flex-wrap gap-2">
                  {VIEWER_GENRES.map(({ id, label }) => {
                    const selected = draft.favorite_genres?.includes(id) ?? false;
                    return <button key={id} type="button" onClick={() => toggleGenre(id)} className={`rounded-full border px-3 py-1.5 text-xs transition duration-200 hover:scale-[1.03] ${selected ? 'border-cyan-400/60 bg-cyan-400/15 text-cyan-100' : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'}`}>{selected && <Check className="mr-1 inline h-3 w-3" />}{label}</button>;
                  })}
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
                <Checkbox checked={draft.is_kids ?? false} onCheckedChange={(checked) => setDraft({ ...draft, is_kids: checked === true })} />
                Perfil infantil: priorizar conteúdo para crianças
              </label>

              {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => { setShowForm(false); setEditingId(null); setError(''); }}>Cancelar</Button>
                <Button type="button" disabled={!draft.name.trim() || saveMutation.isPending} onClick={() => saveMutation.mutate()} className="bg-gradient-to-r from-cyan-600 to-blue-600 text-white">
                  {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{editingId ? 'Salvar alterações' : 'Criar perfil'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {profiles.map((profile) => (
                  <div key={profile.id} className={`group relative overflow-hidden rounded-2xl border p-1 transition duration-300 hover:-translate-y-1 hover:shadow-xl ${activeProfile?.id === profile.id ? 'border-cyan-400/70 bg-cyan-400/10' : 'border-white/10 bg-white/[0.03] hover:border-white/25'}`}>
                    <button type="button" onClick={() => { selectProfile(profile); setOpen(false); }} className="block w-full text-left">
                      <div className={`relative flex h-24 items-end rounded-xl bg-gradient-to-br ${PROFILE_COVERS[profile.cover] || PROFILE_COVERS.violet} p-3`}>
                        <span className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-white/70 bg-black/40 text-3xl shadow-lg">{profile.avatar || '🍿'}</span>
                        {activeProfile?.id === profile.id && <span className="absolute right-2 top-2 rounded-full bg-black/35 p-1 text-cyan-200"><Check className="h-4 w-4" /></span>}
                      </div>
                      <div className="px-2 py-2">
                        <p className="truncate text-sm font-semibold">{profile.name}</p>
                        <p className="mt-0.5 text-[11px] text-slate-400">{profile.is_kids ? 'Infantil' : `${profile.favorite_genres.length} preferências`}</p>
                      </div>
                    </button>
                    <div className="absolute right-2 top-[4.5rem] flex -translate-y-1/2 gap-1 opacity-0 transition duration-200 group-hover:opacity-100 focus-within:opacity-100">
                      <button type="button" aria-label={`Editar ${profile.name}`} onClick={() => startEdit(profile)} className="rounded-full bg-black/60 p-2 text-white hover:bg-black"><Pencil className="h-3.5 w-3.5" /></button>
                      {profiles.length > 1 && <button type="button" aria-label={`Excluir ${profile.name}`} disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(profile.id)} className="rounded-full bg-black/60 p-2 text-rose-200 hover:bg-rose-950"><Trash2 className="h-3.5 w-3.5" /></button>}
                    </div>
                  </div>
                ))}
              </div>

              {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
              <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-4">
                <p className="flex items-center gap-2 text-xs text-slate-400"><Users className="h-4 w-4" />{profiles.length} de 5 perfis</p>
                <Button type="button" variant="outline" disabled={profiles.length >= 5} onClick={startCreate} className="border-white/15 bg-white/5 text-white hover:bg-white/10">
                  <Plus className="mr-2 h-4 w-4" />Adicionar perfil
                </Button>
              </div>
            </div>
          )}
          <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="absolute right-4 top-4 rounded p-1 text-slate-400 transition hover:rotate-90 hover:text-white"><X className="h-4 w-4" /></button>
        </DialogContent>
      </Dialog>
    </>
  );
}
