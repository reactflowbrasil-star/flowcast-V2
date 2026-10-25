import { useState } from 'react';
import { AppVersion, appVersionService } from '@/services/appVersion';
import { ResponsiveTable, ResponsiveTableColumn } from '@/components/ui/responsive-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Download, Edit, Trash2, Smartphone, Tv, Loader2, Power, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { formatBytes } from '@/utils/utils';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { useLoadNamespace } from '@/hooks/useLoadNamespace';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface AppVersionListProps {
    versions: AppVersion[];
    isLoading: boolean;
    onRefresh: () => void;
    onEdit: (version: AppVersion) => void;
    onToggleActive?: (version: AppVersion) => void;
    onToggleMandatory?: (version: AppVersion) => void;
}

export function AppVersionList({
    versions,
    isLoading,
    onRefresh,
    onEdit,
    onToggleActive,
    onToggleMandatory
}: AppVersionListProps) {
    useLoadNamespace('admin/appUpdates');
    const { t } = useTranslation('admin/appUpdates');

    const [deleteId, setDeleteId] = useState<number | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDelete = async () => {
        if (!deleteId) return;
        setIsDeleting(true);
        try {
            const result = await appVersionService.deleteVersion(deleteId);
            if (result.success) {
                toast.success(t('appUpdates.success.deleted'));
                onRefresh();
            } else {
                toast.error(result.error?.details || t('appUpdates.errors.deleteFailed'));
            }
        } catch (error) {
            toast.error(t('appUpdates.errors.deleteFailed'));
        } finally {
            setIsDeleting(false);
            setDeleteId(null);
        }
    };

    const columns: ResponsiveTableColumn<AppVersion>[] = [
        {
            key: 'app_type',
            label: t('appUpdates.table.platform'),
            render: (row: AppVersion) => (
                <div className="flex items-center gap-2">
                    {row.app_type === 'phone' ? (
                        <div className="p-2 rounded-lg bg-blue-500/10">
                            <Smartphone className="h-5 w-5 text-blue-500" />
                        </div>
                    ) : (
                        <div className="p-2 rounded-lg bg-purple-500/10">
                            <Tv className="h-5 w-5 text-purple-500" />
                        </div>
                    )}
                    <div className="flex flex-col">
                        <span className="font-medium">
                            {row.app_type === 'phone'
                                ? t('appUpdates.platforms.android_mobile')
                                : t('appUpdates.platforms.android_tv')}
                        </span>
                        <span className="text-xs text-muted-foreground">
                            v{row.version} (#{row.version_code})
                        </span>
                    </div>
                </div>
            )},
        {
            key: 'file_size',
            label: t('common.size', {}),
            render: (row: AppVersion) => (
                <span className="text-sm font-medium">{formatBytes(row.file_size)}</span>
            )},
        {
            key: 'status',
            label: t('appUpdates.table.status'),
            render: (row: AppVersion) => (
                <div className="flex flex-col gap-1">
                    <Badge
                        variant={row.is_active ? "default" : "secondary"}
                        className={row.is_active ? "bg-green-500 hover:bg-green-600" : ""}
                    >
                        <Power className="h-3 w-3 mr-1" />
                        {row.is_active ? t('appUpdates.status.active') : t('appUpdates.status.inactive')}
                    </Badge>
                    {row.force_update && (
                        <Badge variant="destructive" className="text-xs">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            {t('appUpdates.updateType.mandatory')}
                        </Badge>
                    )}
                </div>
            )},
        {
            key: 'release_notes',
            label: t('appUpdates.form.releaseNotes'),
            render: (row: AppVersion) => (
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span className="text-sm text-muted-foreground truncate max-w-[200px] block cursor-help">
                                {row.release_notes || '-'}
                            </span>
                        </TooltipTrigger>
                        {row.release_notes && (
                            <TooltipContent className="max-w-[300px]">
                                <p className="whitespace-pre-wrap">{row.release_notes}</p>
                            </TooltipContent>
                        )}
                    </Tooltip>
                </TooltipProvider>
            )},
        {
            key: 'created_at',
            label: t('appUpdates.table.releaseDate'),
            render: (row: AppVersion) => (
                <span className="text-sm text-muted-foreground">
                    {format(new Date(row.created_at), 'MMM dd, yyyy')}
                </span>
            )},
        {
            key: 'id',
            label: t('appUpdates.table.actions'),
            render: (row: AppVersion) => (
                <div className="flex items-center gap-1">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onEdit(row)}
                    >
                        <Edit className="h-3 w-3 mr-1" />
                        {t('appUpdates.actions.edit')}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="text-red-500 border-red-500/20 hover:bg-red-500/10"
                        onClick={() => setDeleteId(row.id)}
                    >
                        <Trash2 className="h-3 w-3 mr-1" />
                        {t('appUpdates.actions.delete')}
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => window.open(row.download_url, '_blank')}
                    >
                        <Download className="h-4 w-4" />
                    </Button>
                </div>
            )},
    ];

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            </div>
        );
    }

    if (versions.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-center">
                <Download className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">{t('appUpdates.empty.title')}</h3>
                <p className="text-sm text-muted-foreground max-w-md mt-2">
                    {t('appUpdates.empty.description')}
                </p>
            </div>
        );
    }

    return (
        <>
            <ResponsiveTable
                data={versions}
                columns={columns}
                keyExtractor={(item) => item.id}
            />

            <ConfirmationDialog
                open={!!deleteId}
                onOpenChange={(open) => !open && setDeleteId(null)}
                onConfirm={handleDelete}
                title={t('appUpdates.actions.delete')}
                description={t('appUpdates.confirm.delete')}
                confirmText={t('appUpdates.actions.delete')}
                variant="danger"
                isLoading={isDeleting}
            />
        </>
    );
}
