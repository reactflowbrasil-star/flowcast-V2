'use client';

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useLoadNamespace from '@/hooks/useLoadNamespace';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tv } from 'lucide-react';
import { epgService, EpgSource, CreateEpgSourceRequest, UpdateEpgSourceRequest, EpgChannelInfo } from '@/services/epg';
import { AdminSectionHeader } from './AdminSectionHeader';

export default function EpgManagement() {
  useLoadNamespace('admin/epg');
  const [sources, setSources] = useState<EpgSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<CreateEpgSourceRequest>({ name: '', url: '', timezone: 'UTC', cache_ttl_minutes: 15, is_active: true });
  const [selectedSource, setSelectedSource] = useState<EpgSource | null>(null);
  const [channels, setChannels] = useState<EpgChannelInfo[] | null>(null);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const { t } = useTranslation(['admin/epg', 'admin', 'translation']);

  const loadSources = async () => {
    setLoading(true); setError(null);
    const res = await epgService.getSources();
    if (res.success) setSources(res.data);
    else setError(res.error?.details || t('errors.loadingSources'));
    setLoading(false);
  };

  useEffect(() => { loadSources(); }, []);

  const handleCreate = async () => {
    if (!form.name.trim() || !form.url.trim()) { setError(t('errors.nameUrlRequired')); return; }
    const res = await epgService.createSource(form);
    if (res.success) { setForm({ name: '', url: '', timezone: 'UTC', cache_ttl_minutes: 15, is_active: true }); loadSources(); }
    else setError(res.error?.details || t('errors.createFailed'));
  };

  const handleUpdate = async () => {
    if (!selectedSource) return;
    const payload: UpdateEpgSourceRequest = { ...form };
    const res = await epgService.updateSource(selectedSource.id, payload);
    if (res.success) { setSelectedSource(null); setForm({ name: '', url: '', timezone: 'UTC', cache_ttl_minutes: 15, is_active: true }); loadSources(); }
    else setError(res.error?.details || t('errors.updateFailed'));
  };

  const handleEdit = (src: EpgSource) => {
    setSelectedSource(src);
    setForm({ name: src.name, url: src.url, timezone: src.timezone, cache_ttl_minutes: src.cache_ttl_minutes, is_active: src.is_active });
  };

  const handleDelete = async (src: EpgSource) => {
    if (!confirm(t('confirmDelete', { name: src.name }))) return;
    const res = await epgService.deleteSource(src.id);
    if (res.success) loadSources(); else setError(res.error?.details || t('errors.deleteFailed'));
  };

  const handleDiscover = async (src: EpgSource) => {
    setLoadingChannels(true); setChannels(null); setError(null);
    const res = await epgService.discoverChannels(src.id);
    if (res.success) setChannels(res.data);
    else setError(res.error?.details || t('errors.fetchChannelsFailed'));
    setLoadingChannels(false);
  };

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto w-full">
      <AdminSectionHeader
        icon={Tv}
        title={t('epg.title')}
        description={t('epg.subtitle', { defaultValue: 'Manage EPG sources and TV guide data' })}
        actions={error ? <div className="text-sm text-red-600">{error}</div> : undefined}
      />

      <Card>
        <CardHeader>
          <CardTitle>{selectedSource ? t('epg.editSource') : t('epg.createSource')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-6 gap-4 items-end">
            <div className="col-span-2">
              <Label htmlFor="name">{t('common.name')}</Label>
              <Input id="name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t('epg.inputPlaceholder')} />
            </div>
            <div className="col-span-3">
              <Label htmlFor="url">{t('epg.xmltvUrl')}</Label>
              <Input id="url" value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder={t('epg.urlPlaceholder')} />
            </div>
            <div>
              <Label htmlFor="ttl">{t('epg.ttl')}</Label>
              <Input id="ttl" type="number" value={form.cache_ttl_minutes ?? 15} onChange={e => setForm(f => ({ ...f, cache_ttl_minutes: parseInt(e.target.value || '15', 10) }))} />
            </div>
            <div className="col-span-1 flex items-center space-x-2">
              <Switch checked={!!form.is_active} onCheckedChange={(v) => setForm(f => ({ ...f, is_active: v }))} />
              <Label>{t('common.active')}</Label>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            {selectedSource ? (
              <>
                <Button onClick={handleUpdate}>{t('common.save')}</Button>
                <Button variant="outline" onClick={() => { setSelectedSource(null); setForm({ name: '', url: '', timezone: 'UTC', cache_ttl_minutes: 15, is_active: true }); }}>{t('common.cancel')}</Button>
              </>
            ) : (
              <Button onClick={handleCreate}>{t('common.create')}</Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('epg.sources')}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div>{t('common.loading')}</div>
          ) : (
            <div className="space-y-2">
              {sources.length === 0 && <div className="text-sm text-muted-foreground">{t('epg.noSourcesYet')}</div>}
              {sources.map((src) => (
                <div key={src.id} className="flex items-center justify-between border p-3 rounded-md">
                  <div className="space-y-1">
                    <div className="font-medium">{src.name} {src.is_active ? '' : <span className="text-xs text-muted-foreground">{t('inactive')}</span>}</div>
                    <div className="text-xs text-muted-foreground break-all">{src.url}</div>
                    <div className="text-xs text-muted-foreground">{t('epg.ttl')}: {src.cache_ttl_minutes} {t('units.minutes')} · {t('labels.timezone')} {src.timezone}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => handleDiscover(src)}>{t('epg.fetchChannels')}</Button>
                    <Button variant="outline" onClick={() => handleEdit(src)}>{t('common.edit')}</Button>
                    <Button variant="destructive" onClick={() => handleDelete(src)}>{t('common.delete')}</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {channels && (
        <Card>
          <CardHeader>
            <CardTitle>{t('epg.discoveredChannels')} ({channels.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingChannels ? (
              <div>{t('epg.loadingChannels')}</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-72 overflow-y-auto">
                {channels.map((ch) => (
                  <div key={ch.id} className="border rounded p-2 flex min-w-0 items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate" title={ch.display_name}>{ch.display_name}</div>
                      <div className="text-xs text-muted-foreground truncate" title={ch.id}>{ch.id}</div>
                    </div>
                    {ch.icon && <Image src={ch.icon} alt="" width={32} height={32} className="w-8 h-8 shrink-0 object-contain" />}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
