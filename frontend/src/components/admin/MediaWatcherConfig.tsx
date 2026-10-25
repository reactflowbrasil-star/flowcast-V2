'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import useLoadNamespace from '@/hooks/useLoadNamespace';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger} from '@/components/ui/dialog';
import { 
  FolderOpen, 
  Plus, 
  Trash2, 
  Edit, 
  Play, 
  Clock,
  Film,
  Tv,
  Baby,
  Gamepad2
} from 'lucide-react';
import { toast } from 'sonner';
import { 
  mediaWatcherService, 
  type MediaWatchFolder, 
  type CreateMediaWatchFolderRequest,
  type UpdateMediaWatchFolderRequest,
  type MediaWatchType
} from '@/services/mediaWatcher';
import { format } from 'date-fns';

export default function MediaWatcherConfig() {
  useLoadNamespace('admin/mediaWatcher');
  const { t } = useTranslation(['admin/mediaWatcher', 'admin', 'common']);
  const queryClient = useQueryClient();

  // State
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<MediaWatchFolder | null>(null);
  const [formData, setFormData] = useState<CreateMediaWatchFolderRequest>({
    folder_path: '',
    media_type: 'movies',
    category_id: 1,
    check_interval_minutes: 60});

  // Queries
  const { data: foldersResponse, isLoading } = useQuery({
    queryKey: ['media-watcher-folders'],
    queryFn: () => mediaWatcherService.listFolders(),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const folders = foldersResponse?.data || [];

  // Mutations
  const createMutation = useMutation({
    mutationFn: (request: CreateMediaWatchFolderRequest) => mediaWatcherService.createFolder(request),
    onSuccess: (response) => {
      if (response.success) {
        toast.success(t('mediaWatcher.toasts.createSuccess'));
        queryClient.invalidateQueries({ queryKey: ['media-watcher-folders'] });
        setIsCreateDialogOpen(false);
        resetForm();
      } else {
        toast.error(response.error?.error || t('mediaWatcher.toasts.createFailed'));
      }
    }});

  const updateMutation = useMutation({
    mutationFn: ({ id, request }: { id: number; request: UpdateMediaWatchFolderRequest }) =>
      mediaWatcherService.updateFolder(id, request),
    onSuccess: (response) => {
      if (response.success) {
        toast.success(t('mediaWatcher.toasts.updateSuccess'));
        queryClient.invalidateQueries({ queryKey: ['media-watcher-folders'] });
        setIsEditDialogOpen(false);
        setEditingFolder(null);
      } else {
        toast.error(response.error?.error || t('mediaWatcher.toasts.updateFailed'));
      }
    }});

  const deleteMutation = useMutation({
    mutationFn: (id: number) => mediaWatcherService.deleteFolder(id),
    onSuccess: (response) => {
      if (response.success) {
        toast.success(t('mediaWatcher.toasts.deleteSuccess'));
        queryClient.invalidateQueries({ queryKey: ['media-watcher-folders'] });
      } else {
        toast.error(response.error?.error || t('mediaWatcher.toasts.deleteFailed'));
      }
    }});

  const checkNowMutation = useMutation({
    mutationFn: (id: number) => mediaWatcherService.checkFolderNow(id),
    onSuccess: (response, id) => {
      if (response.success) {
        toast.success(t('mediaWatcher.toasts.checkStarted'));
        queryClient.invalidateQueries({ queryKey: ['media-watcher-folders'] });
      } else {
        toast.error(response.error?.error || t('mediaWatcher.toasts.checkFailed'));
      }
    }});

  const toggleEnabledMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      mediaWatcherService.updateFolder(id, { enabled }),
    onSuccess: (response) => {
      if (response.success) {
        toast.success(
          response.data?.enabled
            ? t('mediaWatcher.toasts.enabled')
            : t('mediaWatcher.toasts.disabled')
        );
        queryClient.invalidateQueries({ queryKey: ['media-watcher-folders'] });
      } else {
        toast.error(response.error?.error || t('mediaWatcher.toasts.toggleFailed'));
      }
    }});

  // Handlers
  const resetForm = () => {
    setFormData({
      folder_path: '',
      media_type: 'movies',
      category_id: 1,
      check_interval_minutes: 60});
  };

  const handleCreate = () => {
    if (!formData.folder_path.trim()) {
      toast.error(t('mediaWatcher.toasts.folderPathRequired'));
      return;
    }
    createMutation.mutate(formData);
  };

  const handleEdit = (folder: MediaWatchFolder) => {
    setEditingFolder(folder);
    setFormData({
      folder_path: folder.folder_path,
      media_type: folder.media_type,
      category_id: folder.category_id,
      check_interval_minutes: folder.check_interval_minutes});
    setIsEditDialogOpen(true);
  };

  const handleUpdate = () => {
    if (!editingFolder) return;
    updateMutation.mutate({
      id: editingFolder.id,
      request: formData});
  };

  const handleDelete = (id: number) => {
    if (confirm(t('mediaWatcher.deleteConfirm'))) {
      deleteMutation.mutate(id);
    }
  };

  const handleCheckNow = (id: number) => {
    checkNowMutation.mutate(id);
  };

  const handleToggleEnabled = (id: number, currentEnabled: boolean) => {
    toggleEnabledMutation.mutate({ id, enabled: !currentEnabled });
  };

  const formatLastCheck = (lastCheck: string | null) => {
    if (!lastCheck) return t('mediaWatcher.table.lastCheckNever');
    try {
      return format(new Date(lastCheck), 'MMM dd, yyyy HH:mm');
    } catch {
      return t('mediaWatcher.table.lastCheckInvalid');
    }
  };

  const getMediaTypeLabel = (type: MediaWatchType) => t(`mediaWatcher.mediaTypes.${type}`);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FolderOpen className="h-5 w-5" />
                {t('mediaWatcher.title')}
              </CardTitle>
              <CardDescription>
                {t('mediaWatcher.description')}
              </CardDescription>
            </div>
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  {t('mediaWatcher.addButton')}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('mediaWatcher.createDialog.title')}</DialogTitle>
                  <DialogDescription>
                    {t('mediaWatcher.createDialog.description')}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="folder-path">{t('mediaWatcher.form.folderPath')}</Label>
                    <Input
                      id="folder-path"
                      placeholder={t('mediaWatcher.form.folderPathPlaceholder')}
                      value={formData.folder_path}
                      onChange={(e) => setFormData({ ...formData, folder_path: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="media-type">{t('mediaWatcher.form.mediaType')}</Label>
                    <Select
                      value={formData.media_type}
                      onValueChange={(value: MediaWatchType) =>
                        setFormData({ ...formData, media_type: value })
                      }
                    >
                      <SelectTrigger id="media-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="movies">
                          <div className="flex items-center gap-2">
                            <Film className="h-4 w-4" />
                            {t('mediaWatcher.mediaTypes.movies')}
                          </div>
                        </SelectItem>
                        <SelectItem value="series">
                          <div className="flex items-center gap-2">
                            <Tv className="h-4 w-4" />
                            {t('mediaWatcher.mediaTypes.series')}
                          </div>
                        </SelectItem>
                        <SelectItem value="kids">
                          <div className="flex items-center gap-2">
                            <Baby className="h-4 w-4" />
                            {t('mediaWatcher.mediaTypes.kids')}
                          </div>
                        </SelectItem>
                        <SelectItem value="anime">
                          <div className="flex items-center gap-2">
                            <Gamepad2 className="h-4 w-4" />
                            {t('mediaWatcher.mediaTypes.anime')}
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="check-interval">{t('mediaWatcher.form.checkInterval')}</Label>
                    <Input
                      id="check-interval"
                      type="number"
                      min="1"
                      value={formData.check_interval_minutes}
                      onChange={(e) =>
                        setFormData({ ...formData, check_interval_minutes: parseInt(e.target.value) || 60 })
                      }
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                    {t('common.cancel')}
                  </Button>
                  <Button onClick={handleCreate} disabled={createMutation.isPending}>
                    {createMutation.isPending ? t('common.creating') : t('common.create')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">{t('common.loading')}</div>
          ) : folders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {t('mediaWatcher.empty')}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('mediaWatcher.table.status')}</TableHead>
                  <TableHead>{t('mediaWatcher.table.folderPath')}</TableHead>
                  <TableHead>{t('mediaWatcher.table.type')}</TableHead>
                  <TableHead>{t('mediaWatcher.table.interval')}</TableHead>
                  <TableHead>{t('mediaWatcher.table.lastCheck')}</TableHead>
                  <TableHead className="text-right">{t('mediaWatcher.table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {folders.map((folder) => (
                  <TableRow key={folder.id}>
                    <TableCell>
                      <Switch
                        checked={folder.enabled}
                        onCheckedChange={() => handleToggleEnabled(folder.id, folder.enabled)}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-sm">{folder.folder_path}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {folder.media_type === 'movies' && <Film className="h-4 w-4" />}
                        {folder.media_type === 'series' && <Tv className="h-4 w-4" />}
                        {folder.media_type === 'kids' && <Baby className="h-4 w-4" />}
                        {folder.media_type === 'anime' && <Gamepad2 className="h-4 w-4" />}
                        {getMediaTypeLabel(folder.media_type)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {folder.check_interval_minutes}m
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatLastCheck(folder.last_check)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCheckNow(folder.id)}
                          disabled={checkNowMutation.isPending}
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(folder)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(folder.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('mediaWatcher.editDialog.title')}</DialogTitle>
            <DialogDescription>{t('mediaWatcher.editDialog.description')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-folder-path">{t('mediaWatcher.form.folderPath')}</Label>
              <Input
                id="edit-folder-path"
                value={formData.folder_path}
                onChange={(e) => setFormData({ ...formData, folder_path: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-check-interval">{t('mediaWatcher.form.checkInterval')}</Label>
              <Input
                id="edit-check-interval"
                type="number"
                min="1"
                value={formData.check_interval_minutes}
                onChange={(e) =>
                  setFormData({ ...formData, check_interval_minutes: parseInt(e.target.value) || 60 })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? t('mediaWatcher.editDialog.updating') : t('mediaWatcher.editDialog.update')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
