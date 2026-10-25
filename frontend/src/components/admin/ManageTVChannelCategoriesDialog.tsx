'use client';
/* eslint-disable @typescript-eslint/no-unused-vars */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import useLoadNamespace from '@/hooks/useLoadNamespace';
import { toast } from 'sonner';
import { contentService } from '@/services';
import { ContentType, type TvChannelCategoryAdmin } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { extractErrorMessage } from '@/lib/error-message';

interface ManageTVChannelCategoriesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CATEGORY_QUERY_KEY = ['tv-channel-categories', 'admin'] as const;
const CATEGORY_OPTIONS_QUERY_KEY = ['tv-channel-categories', 'options'] as const;

export default function ManageTVChannelCategoriesDialog({
  open,
  onOpenChange }: ManageTVChannelCategoriesDialogProps) {
  useLoadNamespace('admin/tvCategories');
  const queryClient = useQueryClient();
  const { t, i18n } = useTranslation(['admin/tvCategories', 'admin', 'translation']);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState('');

  const categoriesQuery = useQuery<TvChannelCategoryAdmin[], Error>({
    queryKey: CATEGORY_QUERY_KEY,
    enabled: open,
    queryFn: async () => {
      const result = await contentService.getAdminTVChannelCategories();
      if (!result.success) {
        throw new Error(extractErrorMessage(result.error, t('common.serverError')));
      }
      return result.data ?? [];
    },
    refetchOnWindowFocus: false,
    staleTime: 60 * 1000
  });

  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data]);

  useEffect(() => {
    if (categoriesQuery.error) {
      toast.error((categoriesQuery.error as Error).message);
    }
  }, [categoriesQuery.error]);

  const createdFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
    [],
  );

  useEffect(() => {
    if (!open) {
      setNewCategoryName('');
      setEditingCategoryId(null);
      setEditingValue('');
    }
  }, [open]);

  const invalidateCategoryQueries = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: CATEGORY_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: CATEGORY_OPTIONS_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: ['content', ContentType.TV] }),
      queryClient.refetchQueries({ queryKey: CATEGORY_OPTIONS_QUERY_KEY, type: 'active' }),
    ]);
  }, [queryClient]);

  const createCategoryMutation = useMutation({
    mutationFn: async (name: string) => {
      const result = await contentService.createTVChannelCategory(name);
      if (!result.success) {
        throw new Error(extractErrorMessage(result.error, t('common.serverError')));
      }
      return result.data;
    },
    onSuccess: (created) => {
      toast.success(t('tvCategories.created'));
      setNewCategoryName('');
      queryClient.setQueryData<string[] | undefined>(CATEGORY_OPTIONS_QUERY_KEY, (prev) => {
        const list = prev ?? [];
        if (!created) {
          return list;
        }
        if (list.some((item) => item.toLowerCase() === created.name.toLowerCase())) {
          return list;
        }
        return [...list, created.name];
      });
      void invalidateCategoryQueries();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    }
  });

  const updateCategoryMutation = useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      const result = await contentService.updateTVChannelCategory(id, name);
      if (!result.success) {
        throw new Error(extractErrorMessage(result.error, t('common.serverError')));
      }
      return result.data;
    },
    onSuccess: (updated) => {
      toast.success(t('tvCategories.updated'));
      setEditingCategoryId(null);
      setEditingValue('');
      if (updated) {
        queryClient.setQueryData<string[] | undefined>(CATEGORY_OPTIONS_QUERY_KEY, (prev) => {
          if (!prev) return prev;
          return prev.map((item) =>
            item.toLowerCase() === updated.name.toLowerCase() ? updated.name : item,
          );
        });
      }
      void invalidateCategoryQueries();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    }
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: number) => {
      const result = await contentService.deleteTVChannelCategory(id);
      if (!result.success) {
        throw new Error(extractErrorMessage(result.error, t('common.serverError')));
      }
      return { id };
    },
    onSuccess: ({ id }) => {
      toast.success(t('tvCategories.removed'));
      queryClient.setQueryData<string[] | undefined>(CATEGORY_OPTIONS_QUERY_KEY, (prev) => {
        if (!prev) return prev;
        const removed = categories.find((item) => item.id === id);
        if (!removed) return prev;
        return prev.filter((item) => item.toLowerCase() !== removed.name.toLowerCase());
      });
      void invalidateCategoryQueries();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    }
  });

  const handleCreateCategory = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = newCategoryName.trim();
    if (!trimmed) {
      toast.error(t('tvCategories.nameRequired'));
      return;
    }
    createCategoryMutation.mutate(trimmed);
  };

  const handleStartEdit = (category: TvChannelCategoryAdmin) => {
    setEditingCategoryId(category.id);
    setEditingValue(category.name);
  };

  const handleSaveEdit = () => {
    if (!editingCategoryId) {
      return;
    }
    const trimmed = editingValue.trim();
    if (!trimmed) {
      toast.error(t('tvCategories.nameRequired'));
      return;
    }
    updateCategoryMutation.mutate({ id: editingCategoryId, name: trimmed });
  };

  const isBusy =
    createCategoryMutation.isPending ||
    updateCategoryMutation.isPending ||
    deleteCategoryMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-[95vw] sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t('tvCategories.title')}</DialogTitle>
          <DialogDescription>
            {t('tvCategories.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <Card className="w-full border border-border/60 bg-background/70 shadow-sm">
            <CardContent className="space-y-3 pt-6">
              <form
                onSubmit={handleCreateCategory}
                className="flex flex-wrap items-center gap-3"
              >
                <div className="flex-1 min-w-[220px]">
                  <Input
                    value={newCategoryName}
                    onChange={(event) => setNewCategoryName(event.target.value)}
                    placeholder={t('tvCategories.inputPlaceholder')}
                    disabled={createCategoryMutation.isPending}
                    className="w-full"
                  />
                </div>
                <Button type="submit" disabled={createCategoryMutation.isPending} className="shrink-0">
                  {createCategoryMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="mr-2 h-4 w-4" />
                  )}
                  {t('tvCategories.addCategory')}
                </Button>
              </form>
              <p className="mt-3 text-xs text-muted-foreground">
                {t('tvCategories.helpText')}
              </p>
            </CardContent>
          </Card>

          <div className="w-full rounded-xl border border-border/60 bg-background/70 shadow-sm">
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium">
                  {t('tvCategories.categoryCount', { count: categories.length })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('tvCategories.protectionNote')}
                </p>
              </div>
              {categoriesQuery.isRefetching && (
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> {t('tvCategories.refreshing')}
                </span>
              )}
            </div>
            <Separator className="opacity-70" />

            {categoriesQuery.isLoading ? (
              <div className="flex items-center gap-2 px-4 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('tvCategories.loading')}
              </div>
            ) : categories.length === 0 ? (
              <div className="px-4 py-8 text-sm text-muted-foreground">
                {t('tvCategories.none')}
              </div>
            ) : (
              <div className="max-h-[360px] overflow-y-auto overflow-x-auto">
                <Table className="table-fixed min-w-[760px]">
                  <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur">
                    <TableRow>
                      <TableHead className="w-[45%]">{t('tvCategories.tableHeaders.category')}</TableHead>
                      <TableHead className="w-[18%]">{t('tvCategories.tableHeaders.usage')}</TableHead>
                      <TableHead className="w-[22%]">{t('tvCategories.tableHeaders.created')}</TableHead>
                      <TableHead className="w-[15%] text-right">{t('tvCategories.tableHeaders.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categories.map((category) => {
                      const isEditing = editingCategoryId === category.id;
                      const canDelete = category.usage_count === 0;
                      const usageLabel =
                        category.usage_count > 0
                          ? `${category.usage_count} channel${category.usage_count === 1 ? '' : 's'}`
                          : 'Not in use';
                      const createdLabel = createdFormatter.format(new Date(category.created_at));

                      return (
                        <TableRow key={category.id}>
                          <TableCell className="align-middle">
                            {isEditing ? (
                              <Input
                                value={editingValue}
                                onChange={(event) => setEditingValue(event.target.value)}
                                disabled={updateCategoryMutation.isPending}
                                autoFocus
                              />
                            ) : (
                              <div className="flex items-center gap-2 max-w-[320px]">
                                <span className="font-medium truncate" title={category.name}>
                                  {category.name}
                                </span>
                                {category.is_default && <Badge variant="secondary">{t('tvCategories.default')}</Badge>}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={category.usage_count > 0 ? 'outline' : 'secondary'} className="truncate">
                              {usageLabel}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs text-muted-foreground" title={createdLabel}>
                              {createdLabel}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-2">
                              {isEditing ? (
                                <>
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={handleSaveEdit}
                                    disabled={updateCategoryMutation.isPending}
                                  >
                                    {t('common.save')}
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                      setEditingCategoryId(null);
                                      setEditingValue('');
                                    }}
                                    disabled={updateCategoryMutation.isPending}
                                  >
                                    {t('common.cancel')}
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleStartEdit(category)}
                                    disabled={isBusy}
                                    title={t('tvCategories.editCategory')}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>

                                  {canDelete ? (
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          disabled={isBusy}
                                          title={t('tvCategories.removeCategory')}
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>{t('tvCategories.removeTitle')}</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            {t('tvCategories.removeDescription', { name: category.name })}
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel disabled={deleteCategoryMutation.isPending}>
                                            {t('common.cancel')}
                                          </AlertDialogCancel>
                                          <AlertDialogAction
                                            onClick={() => deleteCategoryMutation.mutate(category.id)}
                                            disabled={deleteCategoryMutation.isPending}
                                          >
                                            {deleteCategoryMutation.isPending ? (
                                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            ) : null}
                                            {t('common.delete')}
                                          </AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  ) : (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      disabled
                                      title={t('tvCategories.inUseTitle')}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
