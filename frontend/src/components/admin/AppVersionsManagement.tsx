"use client";

import { useEffect, useState, useCallback } from 'react';
import { appVersionService, AppVersion, UpdateAppVersionRequest } from '@/services/appVersion';
import { AppVersionList } from './app-versions/AppVersionList';
import { AppVersionForm } from './app-versions/AppVersionForm';
import { UnifiedModal } from '@/components/ui/unified-modal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Smartphone, Tv, RefreshCw, Download, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useLoadNamespace } from '@/hooks/useLoadNamespace';
import { Badge } from '@/components/ui/badge';
import { formatBytes } from '@/utils/utils';
import { AdminSectionHeader } from './AdminSectionHeader';

export default function AppVersionsManagement() {
    useLoadNamespace('admin/appUpdates');
    const { t } = useTranslation('admin/appUpdates');

    const [versions, setVersions] = useState<AppVersion[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingVersion, setEditingVersion] = useState<AppVersion | undefined>(undefined);

    const fetchVersions = useCallback(async () => {
        setIsLoading(true);
        try {
            const result = await appVersionService.listVersions();
            if (result.success && result.data) {
                setVersions(result.data);
            } else {
                toast.error(result.error?.details || t('errors.loadFailed'));
            }
        } catch (error) {
            toast.error(t('errors.loadFailed'));
        } finally {
            setIsLoading(false);
        }
    }, [t]);

    useEffect(() => {
        fetchVersions();
    }, [fetchVersions]);

    const handleOpenCreate = () => {
        setEditingVersion(undefined);
        setIsModalOpen(true);
    };

    const handleOpenEdit = (version: AppVersion) => {
        setEditingVersion(version);
        setIsModalOpen(true);
    };

    const handleSuccess = () => {
        setIsModalOpen(false);
        fetchVersions();
    };

    const handleToggleActive = async (version: AppVersion) => {
        try {
            const updateData: UpdateAppVersionRequest = {
                is_active: !version.is_active
            };
            const result = await appVersionService.updateVersion(version.id, updateData);
            if (result.success) {
                toast.success(version.is_active ? t('success.deactivated') : t('success.activated'));
                fetchVersions();
            } else {
                toast.error(result.error?.details || t('errors.updateFailed'));
            }
        } catch (error) {
            toast.error(t('errors.updateFailed'));
        }
    };

    const handleToggleMandatory = async (version: AppVersion) => {
        try {
            const updateData: UpdateAppVersionRequest = {
                force_update: !version.force_update
            };
            const result = await appVersionService.updateVersion(version.id, updateData);
            if (result.success) {
                toast.success(t('success.updated'));
                fetchVersions();
            } else {
                toast.error(result.error?.details || t('errors.updateFailed'));
            }
        } catch (error) {
            toast.error(t('errors.updateFailed'));
        }
    };

    // Stats
    const phoneVersions = versions.filter(v => v.app_type === 'phone');
    const tvVersions = versions.filter(v => v.app_type === 'tv');
    const activePhone = phoneVersions.find(v => v.is_active);
    const activeTv = tvVersions.find(v => v.is_active);
    const mandatoryCount = versions.filter(v => v.force_update).length;

    return (
        <div className="space-y-6 max-w-[1400px] mx-auto w-full">
            <AdminSectionHeader
                icon={Download}
                title={t('appUpdates.title')}
                description={t('appUpdates.description')}
                actions={(
                    <>
                        <Button variant="outline" onClick={fetchVersions} disabled={isLoading}>
                            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                            {t('common.refresh', {})}
                        </Button>
                        <Button onClick={handleOpenCreate}>
                            <Plus className="mr-2 h-4 w-4" />
                            {t('appUpdates.actions.create')}
                        </Button>
                    </>
                )}
            />

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-3">
                {/* Phone App Status */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            {t('appUpdates.platforms.android_mobile')}
                        </CardTitle>
                        <Smartphone className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        {activePhone ? (
                            <div>
                                <div className="text-2xl font-bold">v{activePhone.version}</div>
                                <div className="flex items-center gap-2 mt-1">
                                    <Badge variant="default" className="text-xs">
                                        <CheckCircle2 className="h-3 w-3 mr-1" />
                                        {t('appUpdates.status.active')}
                                    </Badge>
                                    {activePhone.force_update && (
                                        <Badge variant="destructive" className="text-xs">
                                            <AlertTriangle className="h-3 w-3 mr-1" />
                                            {t('appUpdates.updateType.mandatory')}
                                        </Badge>
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {formatBytes(activePhone.file_size)}
                                </p>
                            </div>
                        ) : (
                            <div>
                                <p className="text-sm text-muted-foreground">
                                    {t('appUpdates.empty.noUpdatesForPlatform', { platform: 'Phone' })}
                                </p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* TV App Status */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            {t('appUpdates.platforms.android_tv')}
                        </CardTitle>
                        <Tv className="h-4 w-4 text-purple-500" />
                    </CardHeader>
                    <CardContent>
                        {activeTv ? (
                            <div>
                                <div className="text-2xl font-bold">v{activeTv.version}</div>
                                <div className="flex items-center gap-2 mt-1">
                                    <Badge variant="default" className="text-xs">
                                        <CheckCircle2 className="h-3 w-3 mr-1" />
                                        {t('appUpdates.status.active')}
                                    </Badge>
                                    {activeTv.force_update && (
                                        <Badge variant="destructive" className="text-xs">
                                            <AlertTriangle className="h-3 w-3 mr-1" />
                                            {t('appUpdates.updateType.mandatory')}
                                        </Badge>
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {formatBytes(activeTv.file_size)}
                                </p>
                            </div>
                        ) : (
                            <div>
                                <p className="text-sm text-muted-foreground">
                                    {t('appUpdates.empty.noUpdatesForPlatform', { platform: 'TV' })}
                                </p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Total Stats */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            {t('appUpdates.stats.totalUpdates')}
                        </CardTitle>
                        <Download className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{versions.length}</div>
                        <div className="flex gap-2 mt-1">
                            <span className="text-xs text-muted-foreground">
                                📱 {phoneVersions.length} Phone
                            </span>
                            <span className="text-xs text-muted-foreground">
                                📺 {tvVersions.length} TV
                            </span>
                        </div>
                        {mandatoryCount > 0 && (
                            <p className="text-xs text-orange-500 mt-1">
                                ⚠️ {mandatoryCount} {t('appUpdates.stats.mandatoryUpdates').toLowerCase()}
                            </p>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Version List */}
            <Card>
                <CardHeader>
                    <CardTitle>{t('appUpdates.history.title')}</CardTitle>
                    <CardDescription>{t('appUpdates.history.description')}</CardDescription>
                </CardHeader>
                <CardContent>
                    <AppVersionList
                        versions={versions}
                        isLoading={isLoading}
                        onRefresh={fetchVersions}
                        onEdit={handleOpenEdit}
                        onToggleActive={handleToggleActive}
                        onToggleMandatory={handleToggleMandatory}
                    />
                </CardContent>
            </Card>

            {/* Modal */}
            <UnifiedModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={editingVersion ? t('common.edit', {}) : t('appUpdates.actions.create')}
                description={editingVersion
                    ? t('common.editDescription', {})
                    : t('common.createDescription', {})
                }
            >
                <AppVersionForm
                    onSuccess={handleSuccess}
                    onCancel={() => setIsModalOpen(false)}
                    editVersion={editingVersion}
                />
            </UnifiedModal>
        </div>
    );
}
