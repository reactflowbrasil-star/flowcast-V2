'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Gift } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import giftCodesService, { GiftCode, GiftCodeCreateRequest, BulkCreateRequest } from '@/services/giftCodes';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useTranslation } from 'react-i18next';
import useLoadNamespace from '@/hooks/useLoadNamespace';
import { AdminSectionHeader } from './AdminSectionHeader';
export default function GiftCodesManagement() {
  useLoadNamespace('admin/giftcodes');
  const { t } = useTranslation('admin/giftcodes');
  const qc = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [code, setCode] = useState('');
  const [months, setMonths] = useState<number>(1);
  const [uses, setUses] = useState<number>(1);
  const [count, setCount] = useState<number>(10);
  const [prefix, setPrefix] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'gift-codes'],
    queryFn: async () => {
      const res = await giftCodesService.adminList();
      if (res.success) return res.data || [];
      throw new Error(res.error?.details || t('common.serverError'));
    }
  });

  const createMutation = useMutation({
    mutationFn: async (payload: GiftCodeCreateRequest) => {
      const res = await giftCodesService.adminCreate(payload);
      if (res.success) return res.data!;
      throw new Error(res.error?.details || t('common.serverError'));
    },
    onSuccess: () => {
      toast.success(t('created'));
      qc.invalidateQueries({ queryKey: ['admin', 'gift-codes'] });
      setIsCreateOpen(false);
      setCode('');
      setMonths(1);
      setUses(1);
    },
    onError: (err: any) => {
      toast.error(err instanceof Error ? err.message : t('common.serverError'));
    }
  });

  const bulkMutation = useMutation({
    mutationFn: async (payload: BulkCreateRequest) => {
      const res = await giftCodesService.adminBulkCreate(payload);
      if (res.success) return res.data!;
      throw new Error(res.error?.details || t('common.serverError'));
    },
    onSuccess: (data) => {
      toast.success(t('bulkCreated', { count: data.length }));
      qc.invalidateQueries({ queryKey: ['admin', 'gift-codes'] });
      setIsBulkOpen(false);
      setCount(10);
      setPrefix('');
      setMonths(1);
      setUses(1);
    },
    onError: (err: any) => {
      toast.error(err instanceof Error ? err.message : t('common.serverError'));
    }
  });

  // Delete mutation for selected gift codes
  const deleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const res = await giftCodesService.adminBulkDelete(ids);
      if (res.success) return res.data!;
      throw new Error(res.error?.details || t('common.serverError'));
    },
    onSuccess: () => {
      toast.success(t('deletedSelected', { count: selectedIds.length }));
      qc.invalidateQueries({ queryKey: ['admin', 'gift-codes'] });
      setSelectedIds([]);
    },
    onError: (err: any) => {
      toast.error(err instanceof Error ? err.message : t('common.serverError'));
    }
  });

  const exportCsv = () => {
    if (!data || data.length === 0) {
      toast.error(t('noData'));
      return;
    }
    const header = ['code', 'duration_days', 'uses_total', 'uses_remaining', 'expires_at', 'allowed_categories', 'max_devices', 'created_by', 'created_at'];
    const rows = data.map((g: GiftCode) => [
      g.code,
      String(g.duration_days),
      String(g.uses_total),
      String(g.uses_remaining),
      g.expires_at || '',
      (g.allowed_categories || []).join('|'),
      g.max_devices ? String(g.max_devices) : '',
      String(g.created_by),
      g.created_at
    ]);
    const csvContent = [header, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gift_codes_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto w-full">
      <AdminSectionHeader
        icon={Gift}
        title={t('title')}
        description={t('description')}
        actions={(
          <>
            <Button onClick={() => setIsCreateOpen(true)}>{t('create')}</Button>
            <Button variant="secondary" onClick={() => setIsBulkOpen(true)}>{t('bulkCreate')}</Button>
            <Button variant="outline" onClick={exportCsv}>{t('export')}</Button>
            {selectedIds.length > 0 && (
              <Button
                variant="destructive"
                onClick={() => {
                  if (!confirm(t('deleteConfirm', { count: selectedIds.length }))) return;
                  deleteMutation.mutate(selectedIds);
                }}
              >
                {t('deleteSelected', { count: selectedIds.length })}
              </Button>
            )}
          </>
        )}
      />

      <Card>
        <CardContent className="pt-6">
          <div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <input
                      type="checkbox"
                      checked={!!data && selectedIds.length === (data || []).length && (data || []).length > 0}
                      onChange={(e) => {
                        if (!data) return;
                        if (e.target.checked) setSelectedIds((data || []).map(d => d.id));
                        else setSelectedIds([]);
                      }}
                    />
                  </TableHead>
                  <TableHead>{t('table.code')}</TableHead>
                  <TableHead>{t('table.duration_days')}</TableHead>
                  <TableHead>{t('table.uses')}</TableHead>
                  <TableHead>{t('table.remaining')}</TableHead>
                  <TableHead>{t('table.expires_at')}</TableHead>
                  <TableHead>{t('table.created_at')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7}>{t('common.loading')}</TableCell></TableRow>
                ) : (
                  (data || []).map((g) => (
                    <TableRow key={g.id}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(g.id)}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedIds((prev) => Array.from(new Set([...prev, g.id])));
                            else setSelectedIds((prev) => prev.filter(id => id !== g.id));
                          }}
                        />
                      </TableCell>
                      <TableCell>{g.code}</TableCell>
                      <TableCell>{g.duration_days}</TableCell>
                      <TableCell>{g.uses_total}</TableCell>
                      <TableCell>{g.uses_remaining}</TableCell>
                      <TableCell>{g.expires_at ?? '-'}</TableCell>
                      <TableCell>{new Date(g.created_at).toLocaleString()}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>

        {/* Create Dialog */}
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <span />
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('create')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 mt-2">
              <div>
                <label className="block text-sm">{t('form.codeOptional')}</label>
                <div className="flex items-center gap-2">
                  <Input value={code} onChange={(e) => setCode(e.target.value)} />
                  <Button size="sm" onClick={() => {
                    // Generate 3-3-4 alphanumeric (uppercase) e.g. A1B-2CD-3E4F
                    const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
                    const randChars = (n: number) => {
                      return Array.from({ length: n }, () => ALNUM[Math.floor(Math.random() * ALNUM.length)]).join('');
                    };
                    const gen = () => `${randChars(3)}-${randChars(3)}-${randChars(4)}`;
                    setCode(gen());
                  }}>{t('generate')}</Button>
                </div>
              </div>
              <div>
                <label className="block text-sm">{t('form.durationMonths')}</label>
                <Input type="number" value={months} onChange={(e) => setMonths(Number(e.target.value))} />
              </div>
              <div>
                <label className="block text-sm">{t('form.uses')}</label>
                <Input type="number" value={uses} onChange={(e) => setUses(Number(e.target.value))} />
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button onClick={() => createMutation.mutate({
                code: code || undefined,
                duration_months: months,
                uses_total: uses,
                expires_at: null,
                allowed_categories: null,
                max_devices: null
              } as GiftCodeCreateRequest)}>
                {t('create')}
              </Button>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>{t('common.cancel')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bulk Create Dialog */}
        <Dialog open={isBulkOpen} onOpenChange={setIsBulkOpen}>
          <DialogTrigger asChild>
            <span />
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('bulkCreate')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 mt-2">
              <div>
                <label className="block text-sm">{t('form.prefixOptional')}</label>
                <Input value={prefix} onChange={(e) => setPrefix(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm">{t('form.count')}</label>
                <Input type="number" value={count} onChange={(e) => setCount(Number(e.target.value))} />
              </div>
              <div>
                <label className="block text-sm">{t('form.durationMonths')}</label>
                <Input type="number" value={months} onChange={(e) => setMonths(Number(e.target.value))} />
              </div>
              <div>
                <label className="block text-sm">{t('form.usesPerCode')}</label>
                <Input type="number" value={uses} onChange={(e) => setUses(Number(e.target.value))} />
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button onClick={() => bulkMutation.mutate({
                prefix: prefix || undefined,
                count,
                duration_months: months,
                uses_total: uses,
                expires_at: null,
                allowed_categories: null,
                max_devices: null
              } as BulkCreateRequest)}>
                {t('bulkCreate')}
              </Button>
              <Button variant="outline" onClick={() => setIsBulkOpen(false)}>{t('common.cancel')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Card>
    </div>
  );
}
