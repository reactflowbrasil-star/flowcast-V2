'use client';
/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Copy, Eye, EyeOff, Key, Plus, RefreshCw, Trash2, Info } from 'lucide-react';
import { masterApiKeyService, MasterApiKeyListItem, MasterApiKey, CreateMasterApiKeyRequest, UpdateMasterApiKeyRequest } from '@/services/masterApiKey';
import { useTranslation } from 'react-i18next';
import useLoadNamespace from '@/hooks/useLoadNamespace';
import { AdminSectionHeader } from './AdminSectionHeader';

const MasterApiKeyManagement: React.FC = () => {
  useLoadNamespace('admin/masterKeys');
  const [keys, setKeys] = useState<MasterApiKeyListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState<MasterApiKey | null>(null);
  const [showFullKey, setShowFullKey] = useState(false);
  const { t, i18n } = useTranslation(['admin/masterKeys', 'admin', 'translation']);

  // Create form state
  const [createForm, setCreateForm] = useState<CreateMasterApiKeyRequest>({
    key_name: '',
    description: ''
  });


  useEffect(() => {
    loadKeys();
  }, []);

  const loadKeys = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await masterApiKeyService.getMasterApiKeys();
      if (result.success && result.data) {
        setKeys(result.data);
      } else {
        setError(result.error?.details || t('masterKeys.errors.loadFailed'));
      }
    } catch {
      setError(t('masterKeys.errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateKey = async () => {
    if (!createForm.key_name.trim()) {
      setError(t('masterKeys.keyNameRequired'));
      return;
    }

    try {
      const result = await masterApiKeyService.createMasterApiKey(createForm);
      if (result.success && result.data) {
        setSelectedKey(result.data);
        setIsViewDialogOpen(true);
        setIsCreateDialogOpen(false);
        setCreateForm({ key_name: '', description: '' });
        loadKeys();
      } else {
        setError(result.error?.details || t('masterKeys.errors.createFailed'));
      }
    } catch {
      setError(t('masterKeys.errors.createFailed'));
    }
  };

  const handleViewKey = async (id: number) => {
    try {
      const result = await masterApiKeyService.getMasterApiKeyById(id);
      if (result.success && result.data) {
        setSelectedKey(result.data);
        setIsViewDialogOpen(true);
        setShowFullKey(false);
      } else {
        setError(result.error?.details || t('masterKeys.errors.loadSingleFailed'));
      }
    } catch {
      setError(t('masterKeys.errors.loadSingleFailed'));
    }
  };

  const handleToggleEnabled = async (id: number, enabled: boolean) => {
    try {
      const result = await masterApiKeyService.updateMasterApiKey(id, { enabled });
      if (result.success) {
        loadKeys();
      } else {
        setError(result.error?.details || t('masterKeys.errors.updateFailed'));
      }
    } catch {
      setError(t('masterKeys.errors.updateFailed'));
    }
  };

  const handleDeleteKey = async (id: number, keyName: string) => {
    if (!confirm(t('masterKeys.confirmDelete', { keyName }))) {
      return;
    }

    try {
      const result = await masterApiKeyService.deleteMasterApiKey(id);
      if (result.success) {
        loadKeys();
        if (selectedKey?.id === id) {
          setIsViewDialogOpen(false);
          setSelectedKey(null);
        }
      } else {
        setError(result.error?.details || t('masterKeys.errors.deleteFailed'));
      }
    } catch {
      setError(t('masterKeys.errors.deleteFailed'));
    }
  };

  const handleRegenerateKey = async (id: number) => {
    if (!confirm(t('masterKeys.confirmRegenerate'))) {
      return;
    }

    try {
      const result = await masterApiKeyService.regenerateMasterApiKey(id);
      if (result.success && result.data) {
        setSelectedKey(result.data);
        setShowFullKey(true);
        loadKeys();
      } else {
        setError(result.error?.details || t('masterKeys.errors.regenerateFailed'));
      }
    } catch {
      setError(t('masterKeys.errors.regenerateFailed'));
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // You could add a toast notification here
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">{t('masterKeys.loading')}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto w-full">
      <AdminSectionHeader
        icon={Key}
        title={t('sidebar.master-keys')}
        description={t('sidebar.description.master-keys')}
        actions={(
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="min-w-[180px]">
                <Plus className="mr-2 h-4 w-4" />
                {t('common.create')} {t('sidebar.master-keys')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('common.create')} {t('sidebar.master-keys')}</DialogTitle>
                <DialogDescription>
                  {t('masterKeys.createDialogDescription')}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="key_name" className="text-sm font-medium">
                    {t('common.name')} <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="key_name"
                    value={createForm.key_name}
                    onChange={(e) => setCreateForm({ ...createForm, key_name: e.target.value })}
                    placeholder={t('masterKeys.examples.appName')}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('masterKeys.keyNameHelp')}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description" className="text-sm font-medium">
                    {t('common.description')}
                  </Label>
                  <Textarea
                    id="description"
                    value={createForm.description}
                    onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                    placeholder={t('masterKeys.descriptionPlaceholder')}
                    rows={3}
                    className="w-full resize-none"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('masterKeys.descriptionHelp')}
                  </p>
                </div>

                <div className="bg-primary/5 border border-border rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <Info className="h-5 w-5 text-primary mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-primary mb-1">{t('masterKeys.securityNoteTitle')}</p>
                      <p className="text-muted-foreground">
                        {t('masterKeys.securityNoteDescription')}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end space-x-3 pt-4 border-t">
                  <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                    {t('common.cancel')}
                  </Button>
                  <Button
                    onClick={handleCreateKey}
                    disabled={!createForm.key_name.trim()}
                    className="min-w-[120px]"
                  >
                    <Key className="h-4 w-4 mr-2" />
                    {t('common.create')}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      />

      {/* Information */}
      <div className="bg-gradient-to-r from-primary/5 to-primary/10 border border-border rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <div className="p-1 bg-primary/10 rounded-full">
            <Info className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="font-medium text-primary mb-1">{t('masterKeys.infoTitle')}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t('masterKeys.infoText')}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-muted-foreground">
                {t('masterKeys.badges.externalApps')}
              </span>
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-muted-foreground">
                {t('masterKeys.badges.automationScripts')}
              </span>
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-muted-foreground">
                {t('masterKeys.badges.thirdPartyTools')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <Alert className="border-destructive/20 bg-destructive/5">
          <AlertDescription className="text-destructive">{error}</AlertDescription>
        </Alert>
      )}

      {/* Keys List */}
      <div className="grid gap-4">
        {keys.length === 0 ? (
          <Card className="border-dashed border-2">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="text-center space-y-4">
                <div className="p-4 bg-muted rounded-full w-fit mx-auto">
                  <Key className="h-8 w-8 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-foreground mb-2">{t('masterKeys.empty.title')}</h3>
                  <p className="text-muted-foreground mb-4">
                    {t('masterKeys.empty.description')}
                  </p>
                  <Button onClick={() => setIsCreateDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    {t('common.create')}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          keys.map((key) => (
            <Card key={key.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <CardTitle className="flex items-center gap-3 text-lg">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <Key className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex flex-col">
                        <span>{key.key_name}</span>
                        <Badge
                          variant={key.enabled ? "default" : "secondary"}
                          className="w-fit mt-1"
                        >
                          {key.enabled ? t('common.enabled') : t('common.disabled')}
                        </Badge>
                      </div>
                    </CardTitle>
                    <CardDescription className="mt-2 text-sm">
                      {key.description || t('masterKeys.noDescription')}
                    </CardDescription>
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewKey(key.id)}
                      className="h-9 w-9 p-0"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteKey(key.id, key.key_name)}
                      className="h-9 w-9 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-3">
                  {/* API Key Preview */}
                  <div className="flex min-w-0 items-center justify-between gap-3 p-3 bg-muted rounded-lg">
                    <span className="shrink-0 text-sm font-medium text-muted-foreground">{t('masterKeys.apiKeyLabel')}</span>
                    <code className="min-w-0 truncate bg-card border px-3 py-1 rounded text-xs font-mono">
                      {key.api_key_preview}
                    </code>
                  </div>

                  {/* Metadata Grid */}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">{t('masterKeys.labels.created')}:</span>
                      <p className="font-medium text-foreground">{formatDate(key.created_at)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t('masterKeys.labels.lastUsed')}:</span>
                      <p className="font-medium text-foreground">
                        {key.last_used_at ? formatDate(key.last_used_at) : t('masterKeys.neverLabel')}
                      </p>
                    </div>
                  </div>

                  {/* Status Toggle */}
                  <div className="flex items-center justify-between pt-2 border-t">
                    <span className="text-sm font-medium text-muted-foreground">{t('masterKeys.activeStatus')}:</span>
                    <Switch
                      checked={key.enabled}
                      onCheckedChange={(checked) => handleToggleEnabled(key.id, checked)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* View/Edit Key Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('masterKeys.detailsTitle')}</DialogTitle>
            <DialogDescription>
              {t('masterKeys.detailsDescription')}
            </DialogDescription>
          </DialogHeader>
          {selectedKey && (
            <div className="space-y-6">
              {/* Header Info */}
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">{selectedKey.key_name}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {selectedKey.description || t('masterKeys.noDescription')}
                  </p>
                </div>
                <Badge variant={selectedKey.enabled ? "default" : "secondary"} className="text-sm">
                  {selectedKey.enabled ? t('common.enabled') : t('common.disabled')}
                </Badge>
              </div>

              {/* API Key Section */}
              <div className="space-y-3">
                <Label className="text-base font-medium">{t('masterKeys.apiKeyLabel')}</Label>
                <div className="flex items-center space-x-3">
                  <div className="flex-1 relative">
                    <code className="block w-full bg-muted border rounded-md p-3 font-mono text-sm break-all">
                      {showFullKey ? selectedKey.api_key : '••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••'}
                    </code>
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowFullKey(!showFullKey)}
                      className="px-3"
                    >
                      {showFullKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    {showFullKey && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(selectedKey.api_key)}
                        className="px-3"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
                {showFullKey && (
                  <p className="text-xs text-muted-foreground">
                    {t('masterKeys.fullAccessWarning')}
                  </p>
                )}
              </div>

              {/* Metadata */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">{t('masterKeys.labels.created')}</Label>
                  <p className="text-sm text-foreground mt-1">{formatDate(selectedKey.created_at)}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">{t('masterKeys.labels.lastUpdated')}</Label>
                  <p className="text-sm text-foreground mt-1">{formatDate(selectedKey.updated_at)}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">{t('masterKeys.labels.lastUsed')}</Label>
                  <p className="text-sm text-foreground mt-1">
                    {selectedKey.last_used_at ? formatDate(selectedKey.last_used_at) : t('masterKeys.neverLabel')}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row justify-between gap-3 pt-4 border-t">
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => handleRegenerateKey(selectedKey.id)}
                    className="flex items-center gap-2"
                  >
                    <RefreshCw className="h-4 w-4" />
                    {t('masterKeys.regenerateButton')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleToggleEnabled(selectedKey.id, !selectedKey.enabled)}
                    className="flex items-center gap-2"
                  >
                    {selectedKey.enabled ? t('common.disable') : t('common.enable')}
                  </Button>
                </div>
                <Button
                  variant="destructive"
                  onClick={() => handleDeleteKey(selectedKey.id, selectedKey.key_name)}
                  className="flex items-center gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  {t('masterKeys.deleteButton')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MasterApiKeyManagement;
