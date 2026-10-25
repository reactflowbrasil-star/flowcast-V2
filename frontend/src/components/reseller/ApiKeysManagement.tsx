'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import useLoadNamespace from '@/hooks/useLoadNamespace';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  Key, 
  Plus, 
  Copy, 
  Trash2, 
  RefreshCw, 
  Eye, 
  EyeOff,
  Shield,
  Clock,
  Activity,
  AlertTriangle,
  Check,
  Settings,
  Pencil
} from 'lucide-react';
import { 
  resellerApiKeysService, 
  ResellerApiKey, 
  CreateApiKeyRequest,
  ApiKeyPermission 
} from '@/services/resellerApiKeys';
import { toast } from 'sonner';

const GLASS_CARD_STYLE = "border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm shadow-sm";

interface ApiKeysManagementProps {
  className?: string;
}

export default function ApiKeysManagement({ className }: ApiKeysManagementProps) {
  const nsLoading = useLoadNamespace('reseller/apiKeys');
  const { t } = useTranslation(['reseller/apiKeys', 'reseller', 'translation']);
  const queryClient = useQueryClient();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showSecretDialog, setShowSecretDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedKey, setSelectedKey] = useState<ResellerApiKey | null>(null);
  const [newSecretKey, setNewSecretKey] = useState<string>('');
  const [showSecret, setShowSecret] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editFormData, setEditFormData] = useState<{
    key_name: string;
    permissions: string[];
    allowed_origins: string;
    rate_limit_per_minute: number;
    rate_limit_per_day: number;
  }>({
    key_name: '',
    permissions: [],
    allowed_origins: '*',
    rate_limit_per_minute: 60,
    rate_limit_per_day: 10000});

  const [formData, setFormData] = useState<CreateApiKeyRequest>({
    key_name: '',
    permissions: ['users:read', 'credits:read'],
    allowed_origins: '*',
    rate_limit_per_minute: 60,
    rate_limit_per_day: 10000});

  const { data: apiKeys = [], isLoading } = useQuery({
    queryKey: ['reseller-api-keys'],
    queryFn: async () => {
      const result = await resellerApiKeysService.listApiKeys();
      return result.success ? result.data : [];
    }});

  const { data: permissionsData } = useQuery({
    queryKey: ['api-key-permissions'],
    queryFn: async () => {
      const result = await resellerApiKeysService.listPermissions();
      return result.success ? result.data?.permissions : [];
    }});

  const createMutation = useMutation({
    mutationFn: (request: CreateApiKeyRequest) => resellerApiKeysService.createApiKey(request),
    onSuccess: (result) => {
      if (result.success && result.data) {
        setNewSecretKey(result.data.secret_key);
        setShowCreateDialog(false);
        setShowSecretDialog(true);
        queryClient.invalidateQueries({ queryKey: ['reseller-api-keys'] });
        toast.success(t('toast.created', { ns: 'reseller/apiKeys' }));
      } else {
        toast.error(result.error?.details || t('toast.errors.create', { ns: 'reseller/apiKeys' }));
      }
    }});

  const deleteMutation = useMutation({
    mutationFn: (id: number) => resellerApiKeysService.deleteApiKey(id),
    onSuccess: (result) => {
      if (result.success) {
        setShowDeleteDialog(false);
        setSelectedKey(null);
        queryClient.invalidateQueries({ queryKey: ['reseller-api-keys'] });
        toast.success(t('toast.deleted', { ns: 'reseller/apiKeys' }));
      } else {
        toast.error(result.error?.details || t('toast.errors.delete', { ns: 'reseller/apiKeys' }));
      }
    }});

  const regenerateMutation = useMutation({
    mutationFn: (id: number) => resellerApiKeysService.regenerateApiKey(id),
    onSuccess: (result) => {
      if (result.success && result.data) {
        setNewSecretKey(result.data.secret_key);
        setShowRegenerateDialog(false);
        setShowSecretDialog(true);
        queryClient.invalidateQueries({ queryKey: ['reseller-api-keys'] });
        toast.success(t('toast.regenerated', { ns: 'reseller/apiKeys' }));
      } else {
        toast.error(result.error?.details || t('toast.errors.regenerate', { ns: 'reseller/apiKeys' }));
      }
    }});

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      resellerApiKeysService.updateApiKey(id, { is_active }),
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ['reseller-api-keys'] });
        toast.success(t('toast.statusUpdated', { ns: 'reseller/apiKeys' }));
      }
    }});

  const updateKeyMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { key_name?: string; permissions?: string[]; allowed_origins?: string; rate_limit_per_minute?: number; rate_limit_per_day?: number } }) =>
      resellerApiKeysService.updateApiKey(id, data),
    onSuccess: (result) => {
      if (result.success) {
        setShowEditDialog(false);
        setSelectedKey(null);
        queryClient.invalidateQueries({ queryKey: ['reseller-api-keys'] });
        toast.success(t('toast.updated', { ns: 'reseller/apiKeys' }));
      } else {
        toast.error(result.error?.details || t('toast.errors.update', { ns: 'reseller/apiKeys' }));
      }
    }});

  const handleEditPermissionToggle = (permId: string) => {
    setEditFormData((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(permId)
        ? prev.permissions.filter((p) => p !== permId)
        : [...prev.permissions, permId]}));
  };

  const handleEditSubmit = () => {
    if (!selectedKey) return;
    if (!editFormData.key_name.trim()) {
      toast.error(t('validation.keyNameRequired', { ns: 'reseller/apiKeys' }));
      return;
    }
    if (editFormData.permissions.length === 0) {
      toast.error(t('validation.permissionRequired', { ns: 'reseller/apiKeys' }));
      return;
    }
    updateKeyMutation.mutate({
      id: selectedKey.id,
      data: {
        key_name: editFormData.key_name,
        permissions: editFormData.permissions,
        allowed_origins: editFormData.allowed_origins,
        rate_limit_per_minute: editFormData.rate_limit_per_minute,
        rate_limit_per_day: editFormData.rate_limit_per_day}});
  };

  const openEditDialog = (key: ResellerApiKey) => {
    setSelectedKey(key);
    setEditFormData({
      key_name: key.key_name,
      permissions: key.permissions,
      allowed_origins: key.allowed_origins || '*',
      rate_limit_per_minute: key.rate_limit_per_minute,
      rate_limit_per_day: key.rate_limit_per_day});
    setShowEditDialog(true);
  };

  const handleCopySecret = async () => {
    await navigator.clipboard.writeText(newSecretKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success(t('secretKeyCopied'));
  };

  const handlePermissionToggle = (permId: string) => {
    setFormData((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(permId)
        ? prev.permissions.filter((p) => p !== permId)
        : [...prev.permissions, permId]}));
  };

  const handleCreateSubmit = () => {
    if (!formData.key_name.trim()) {
      toast.error(t('validation.keyNameRequired', { ns: 'reseller/apiKeys' }));
      return;
    }
    if (formData.permissions.length === 0) {
      toast.error(t('validation.permissionRequired', { ns: 'reseller/apiKeys' }));
      return;
    }
    createMutation.mutate(formData);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return t('never', { ns: 'reseller/apiKeys' });
    return new Date(dateStr).toLocaleString();
  };

  const fallbackPermissionIds = ['users:read', 'users:create', 'users:update', 'users:extend', 'users:delete', 'credits:read'];
  const permissions: ApiKeyPermission[] = permissionsData || fallbackPermissionIds.map((id) => ({
    id,
    name: id,
    description: t('common.notAvailable', { ns: 'translation' }),
  }));

  if (nsLoading) {
    return (
      <div className={className}>
        <Card className={GLASS_CARD_STYLE}>
          <CardHeader>
            <CardTitle>{t('common.loading', { ns: 'translation' })}</CardTitle>
            <CardDescription>{t('common.loading', { ns: 'translation' })}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className={className}>
      <Card className={GLASS_CARD_STYLE}>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              {t('title', { ns: 'reseller/apiKeys' })}
            </CardTitle>
            <CardDescription>
              {t('description', { ns: 'reseller/apiKeys' })}
            </CardDescription>
          </div>
          <Button onClick={() => {
            setFormData({
              key_name: '',
              permissions: ['users:read', 'credits:read'],
              allowed_origins: '*',
              rate_limit_per_minute: 60,
              rate_limit_per_day: 10000});
            setShowCreateDialog(true);
          }}>
            <Plus className="h-4 w-4 mr-2" />
            {t('createButton', { ns: 'reseller/apiKeys' })}
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : apiKeys && apiKeys.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Key className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t('empty.title', { ns: 'reseller/apiKeys' })}</p>
              <p className="text-sm mt-1">{t('empty.description', { ns: 'reseller/apiKeys' })}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('table.name', { ns: 'reseller/apiKeys' })}</TableHead>
                  <TableHead>{t('table.key', { ns: 'reseller/apiKeys' })}</TableHead>
                  <TableHead>{t('table.permissions', { ns: 'reseller/apiKeys' })}</TableHead>
                  <TableHead>{t('table.lastUsed', { ns: 'reseller/apiKeys' })}</TableHead>
                  <TableHead>{t('table.requests', { ns: 'reseller/apiKeys' })}</TableHead>
                  <TableHead>{t('table.status', { ns: 'reseller/apiKeys' })}</TableHead>
                  <TableHead className="text-right">{t('table.actions', { ns: 'reseller/apiKeys' })}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apiKeys?.map((key) => (
                  <TableRow key={key.id}>
                    <TableCell className="font-medium">{key.key_name}</TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-2 py-1 rounded">
                        {key.api_key_prefix}
                      </code>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {key.permissions.slice(0, 2).map((perm) => (
                          <Badge key={perm} variant="secondary" className="text-xs">
                            {perm.split(':')[1]}
                          </Badge>
                        ))}
                        {key.permissions.length > 2 && (
                          <Badge variant="outline" className="text-xs">
                            +{key.permissions.length - 2}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(key.last_used_at)}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{key.total_requests.toLocaleString()}</span>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={key.is_active}
                        onCheckedChange={(checked) =>
                          toggleActiveMutation.mutate({ id: key.id, is_active: checked })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(key)}
                          title={t('common.edit', { ns: 'translation' })}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedKey(key);
                            setShowRegenerateDialog(true);
                          }}
                          title={t('common.refresh', { ns: 'translation' })}
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedKey(key);
                            setShowDeleteDialog(true);
                          }}
                          title={t('common.delete', { ns: 'translation' })}
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

      {/* API Documentation Card */}
      <Card className={`${GLASS_CARD_STYLE} mt-6`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            {t('apiUsage.title', { ns: 'reseller/apiKeys' })}
          </CardTitle>
          <CardDescription>
            {t('apiUsage.description', { ns: 'reseller/apiKeys' })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted/50 p-4 rounded-lg">
            <p className="text-sm font-medium mb-2">{t('apiUsage.authHeader', { ns: 'reseller/apiKeys' })}</p>
            <code className="text-xs bg-background px-3 py-2 rounded block">
              X-API-Key: sk_live_your_secret_key_here
            </code>
          </div>
          <div className="bg-muted/50 p-4 rounded-lg">
            <p className="text-sm font-medium mb-2">{t('apiUsage.exampleListUsers', { ns: 'reseller/apiKeys' })}</p>
            <code className="text-xs bg-background px-3 py-2 rounded block whitespace-pre-wrap">
{`curl -X GET "https://your-domain.com/api/v1/users" \\
  -H "X-API-Key: sk_live_your_secret_key_here"`}
            </code>
          </div>
          <div className="bg-muted/50 p-4 rounded-lg">
            <p className="text-sm font-medium mb-2">{t('apiUsage.exampleCreateUser', { ns: 'reseller/apiKeys' })}</p>
            <code className="text-xs bg-background px-3 py-2 rounded block whitespace-pre-wrap">
{`curl -X POST "https://your-domain.com/api/v1/users" \\
  -H "X-API-Key: sk_live_your_secret_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{"username":"new_user","password":"secret123","max_devices":3,"duration_months":1}'`}
            </code>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
            <div className="text-center p-3 border rounded-lg">
              <p className="text-xs text-muted-foreground">{t('apiUsage.endpoint', { ns: 'reseller/apiKeys' })}</p>
              <p className="font-mono text-sm">/api/v1/users</p>
            </div>
            <div className="text-center p-3 border rounded-lg">
              <p className="text-xs text-muted-foreground">{t('apiUsage.endpoint', { ns: 'reseller/apiKeys' })}</p>
              <p className="font-mono text-sm">/api/v1/credits/balance</p>
            </div>
            <div className="text-center p-3 border rounded-lg">
              <p className="text-xs text-muted-foreground">{t('apiUsage.endpoint', { ns: 'reseller/apiKeys' })}</p>
              <p className="font-mono text-sm">/api/v1/users/:id/extend</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Create API Key Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('createDialog.title', { ns: 'reseller/apiKeys' })}</DialogTitle>
            <DialogDescription>
              {t('createDialog.description', { ns: 'reseller/apiKeys' })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="key_name">{t('createDialog.keyName', { ns: 'reseller/apiKeys' })}</Label>
              <Input
                id="key_name"
                placeholder={t('createDialog.keyNamePlaceholder', { ns: 'reseller/apiKeys' })}
                value={formData.key_name}
                onChange={(e) => setFormData({ ...formData, key_name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('createDialog.permissions', { ns: 'reseller/apiKeys' })}</Label>
              <div className="grid grid-cols-1 gap-2 border rounded-lg p-3">
                {permissions.map((perm) => (
                  <div key={perm.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={perm.id}
                      checked={formData.permissions.includes(perm.id)}
                      onCheckedChange={() => handlePermissionToggle(perm.id)}
                    />
                    <div className="flex-1">
                      <label htmlFor={perm.id} className="text-sm font-medium cursor-pointer">
                        {perm.name}
                      </label>
                      <p className="text-xs text-muted-foreground">{perm.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="allowed_origins">{t('createDialog.allowedOrigins', { ns: 'reseller/apiKeys' })}</Label>
              <Input
                id="allowed_origins"
                placeholder={t('createDialog.allowedOriginsPlaceholder', { ns: 'reseller/apiKeys' })}
                value={formData.allowed_origins}
                onChange={(e) => setFormData({ ...formData, allowed_origins: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                {t('createDialog.allowedOriginsHelp', { ns: 'reseller/apiKeys' })}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="rate_minute">{t('createDialog.rateLimitMinute', { ns: 'reseller/apiKeys' })}</Label>
                <Input
                  id="rate_minute"
                  type="number"
                  value={formData.rate_limit_per_minute}
                  onChange={(e) => setFormData({ ...formData, rate_limit_per_minute: parseInt(e.target.value) || 60 })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rate_day">{t('createDialog.rateLimitDay', { ns: 'reseller/apiKeys' })}</Label>
                <Input
                  id="rate_day"
                  type="number"
                  value={formData.rate_limit_per_day}
                  onChange={(e) => setFormData({ ...formData, rate_limit_per_day: parseInt(e.target.value) || 10000 })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              {t('createDialog.cancel', { ns: 'reseller/apiKeys' })}
            </Button>
            <Button onClick={handleCreateSubmit} disabled={createMutation.isPending}>
              {createMutation.isPending ? t('createDialog.creating', { ns: 'reseller/apiKeys' }) : t('createDialog.create', { ns: 'reseller/apiKeys' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Secret Key Display Dialog */}
      <Dialog open={showSecretDialog} onOpenChange={setShowSecretDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-green-500" />
              {t('secretDialog.title', { ns: 'reseller/apiKeys' })}
            </DialogTitle>
            <DialogDescription>
              {t('secretDialog.description', { ns: 'reseller/apiKeys' })}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Alert variant="destructive" className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {t('secretDialog.warning', { ns: 'reseller/apiKeys' })}
              </AlertDescription>
            </Alert>
            <div className="relative">
              <Input
                type={showSecret ? 'text' : 'password'}
                value={newSecretKey}
                readOnly
                className="pr-20 font-mono text-sm"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setShowSecret(!showSecret)}
                >
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleCopySecret}
                >
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => {
              setShowSecretDialog(false);
              setNewSecretKey('');
              setShowSecret(false);
            }}>
              {t('secretDialog.copied', { ns: 'reseller/apiKeys' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('deleteDialog.title', { ns: 'reseller/apiKeys' })}</DialogTitle>
            <DialogDescription>
              {t('deleteDialog.description', { ns: 'reseller/apiKeys', keyName: selectedKey?.key_name || '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              {t('deleteDialog.cancel', { ns: 'reseller/apiKeys' })}
            </Button>
            <Button
              variant="destructive"
              onClick={() => selectedKey && deleteMutation.mutate(selectedKey.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? t('deleteDialog.deleting', { ns: 'reseller/apiKeys' }) : t('deleteDialog.delete', { ns: 'reseller/apiKeys' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Regenerate Confirmation Dialog */}
      <Dialog open={showRegenerateDialog} onOpenChange={setShowRegenerateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('regenerateDialog.title', { ns: 'reseller/apiKeys' })}</DialogTitle>
            <DialogDescription>
              {t('regenerateDialog.description', { ns: 'reseller/apiKeys', keyName: selectedKey?.key_name || '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRegenerateDialog(false)}>
              {t('regenerateDialog.cancel', { ns: 'reseller/apiKeys' })}
            </Button>
            <Button
              onClick={() => selectedKey && regenerateMutation.mutate(selectedKey.id)}
              disabled={regenerateMutation.isPending}
            >
              {regenerateMutation.isPending ? t('regenerateDialog.regenerating', { ns: 'reseller/apiKeys' }) : t('regenerateDialog.regenerate', { ns: 'reseller/apiKeys' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit API Key Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5" />
              {t('editDialog.title', { ns: 'reseller/apiKeys' })}
            </DialogTitle>
            <DialogDescription>
              {t('editDialog.description', { ns: 'reseller/apiKeys' })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit_key_name">{t('editDialog.keyName', { ns: 'reseller/apiKeys' })}</Label>
              <Input
                id="edit_key_name"
                placeholder={t('editDialog.keyNamePlaceholder', { ns: 'reseller/apiKeys' })}
                value={editFormData.key_name}
                onChange={(e) => setEditFormData({ ...editFormData, key_name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('editDialog.permissions', { ns: 'reseller/apiKeys' })}</Label>
              <div className="grid grid-cols-1 gap-2 border rounded-lg p-3 max-h-64 overflow-y-auto">
                {permissions.map((perm) => (
                  <div key={perm.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`edit_${perm.id}`}
                      checked={editFormData.permissions.includes(perm.id)}
                      onCheckedChange={() => handleEditPermissionToggle(perm.id)}
                    />
                    <div className="flex-1">
                      <label htmlFor={`edit_${perm.id}`} className="text-sm font-medium cursor-pointer">
                        {perm.name}
                      </label>
                      <p className="text-xs text-muted-foreground">{perm.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit_allowed_origins">{t('editDialog.allowedOrigins', { ns: 'reseller/apiKeys' })}</Label>
              <Input
                id="edit_allowed_origins"
                placeholder={t('editDialog.allowedOriginsPlaceholder', { ns: 'reseller/apiKeys' })}
                value={editFormData.allowed_origins}
                onChange={(e) => setEditFormData({ ...editFormData, allowed_origins: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit_rate_minute">{t('editDialog.rateLimitMinute', { ns: 'reseller/apiKeys' })}</Label>
                <Input
                  id="edit_rate_minute"
                  type="number"
                  value={editFormData.rate_limit_per_minute}
                  onChange={(e) => setEditFormData({ ...editFormData, rate_limit_per_minute: parseInt(e.target.value) || 60 })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_rate_day">{t('editDialog.rateLimitDay', { ns: 'reseller/apiKeys' })}</Label>
                <Input
                  id="edit_rate_day"
                  type="number"
                  value={editFormData.rate_limit_per_day}
                  onChange={(e) => setEditFormData({ ...editFormData, rate_limit_per_day: parseInt(e.target.value) || 10000 })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              {t('editDialog.cancel', { ns: 'reseller/apiKeys' })}
            </Button>
            <Button onClick={handleEditSubmit} disabled={updateKeyMutation.isPending}>
              {updateKeyMutation.isPending ? t('editDialog.saving', { ns: 'reseller/apiKeys' }) : t('editDialog.save', { ns: 'reseller/apiKeys' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
