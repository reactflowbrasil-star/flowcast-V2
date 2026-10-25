import { useState, useEffect } from 'react';
import { CreateAppVersionRequest, UpdateAppVersionRequest, AppVersion, appVersionService } from '@/services/appVersion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useLoadNamespace } from '@/hooks/useLoadNamespace';
import { Upload, Smartphone, Tv, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface AppVersionFormProps {
    onSuccess: () => void;
    onCancel: () => void;
    editVersion?: AppVersion;
}

export function AppVersionForm({ onSuccess, onCancel, editVersion }: AppVersionFormProps) {
    useLoadNamespace('admin/appUpdates');
    const { t } = useTranslation('admin/appUpdates');

    const [formData, setFormData] = useState<Partial<CreateAppVersionRequest>>({
        app_type: 'phone',
        force_update: false,
        version: '',
        version_code: 1,
        min_required_version: '',
        release_notes: ''});

    const [file, setFile] = useState<File | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);

    useEffect(() => {
        if (editVersion) {
            setFormData({
                app_type: editVersion.app_type,
                force_update: editVersion.force_update,
                version: editVersion.version,
                version_code: editVersion.version_code,
                min_required_version: editVersion.min_required_version || '',
                release_notes: editVersion.release_notes || ''});
        }
    }, [editVersion]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setUploadProgress(0);

        try {
            if (editVersion) {
                // Update mode
                const updateData: UpdateAppVersionRequest = {
                    force_update: formData.force_update,
                    release_notes: formData.release_notes,
                    min_required_version: formData.min_required_version || undefined,
                    is_active: editVersion.is_active};
                const result = await appVersionService.updateVersion(editVersion.id, updateData);
                if (result.success) {
                    toast.success(t('appUpdates.success.updated'));
                    onSuccess();
                } else {
                    toast.error(result.error?.details || t('appUpdates.errors.updateFailed'));
                }
            } else {
                // Create mode
                if (!file) {
                    toast.error(t('common.selectApk', {}));
                    setIsSubmitting(false);
                    return;
                }
                if (!formData.version) {
                    toast.error(t('appUpdates.errors.versionRequired'));
                    setIsSubmitting(false);
                    return;
                }
                if (!formData.version_code) {
                    toast.error(t('common.versionCodeRequired', {}));
                    setIsSubmitting(false);
                    return;
                }

                const createData: CreateAppVersionRequest = {
                    app_type: formData.app_type as 'phone' | 'tv',
                    version: formData.version,
                    version_code: Number(formData.version_code),
                    force_update: !!formData.force_update,
                    release_notes: formData.release_notes,
                    min_required_version: formData.min_required_version || undefined,
                    apk_file: file};

                const result = await appVersionService.createVersion(createData, (progress) => {
                    setUploadProgress(progress);
                });

                if (result.success) {
                    toast.success(t('appUpdates.success.created'));
                    onSuccess();
                } else {
                    toast.error(result.error?.details || t('appUpdates.errors.createFailed'));
                }
            }
        } catch (error) {
            toast.error(t('common.error', {}));
            console.error(error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="app_type">{t('appUpdates.form.platform')}</Label>
                    <Select
                        disabled={!!editVersion}
                        value={formData.app_type}
                        onValueChange={(val) => setFormData(prev => ({ ...prev, app_type: val as any }))}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder={t('appUpdates.form.selectPlatform')} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="phone">
                                <div className="flex items-center gap-2">
                                    <Smartphone className="h-4 w-4" />
                                    {t('appUpdates.platforms.android_mobile')}
                                </div>
                            </SelectItem>
                            <SelectItem value="tv">
                                <div className="flex items-center gap-2">
                                    <Tv className="h-4 w-4" />
                                    {t('appUpdates.platforms.android_tv')}
                                </div>
                            </SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="version_code">{t('appUpdates.form.versionCode')}</Label>
                    <Input
                        id="version_code"
                        type="number"
                        disabled={!!editVersion}
                        value={formData.version_code}
                        onChange={(e) => setFormData(prev => ({ ...prev, version_code: parseInt(e.target.value) }))}
                        placeholder={t('appUpdates.form.versionCodePlaceholder')}
                        required
                    />
                    <p className="text-xs text-muted-foreground">{t('appUpdates.form.versionCodeHelp')}</p>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="version">{t('appUpdates.form.version')}</Label>
                    <Input
                        id="version"
                        disabled={!!editVersion}
                        placeholder={t('appUpdates.form.versionPlaceholder')}
                        value={formData.version}
                        onChange={(e) => setFormData(prev => ({ ...prev, version: e.target.value }))}
                        required
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="min_version">{t('common.minVersion', {})}</Label>
                    <Input
                        id="min_version"
                        placeholder={t('appUpdates.form.versionPlaceholder')}
                        value={formData.min_required_version}
                        onChange={(e) => setFormData(prev => ({ ...prev, min_required_version: e.target.value }))}
                    />
                </div>
            </div>

            <div className="space-y-2">
                <Label htmlFor="release_notes">{t('appUpdates.form.releaseNotes')}</Label>
                <Textarea
                    id="release_notes"
                    placeholder={t('appUpdates.form.releaseNotesPlaceholder')}
                    value={formData.release_notes}
                    onChange={(e) => setFormData(prev => ({ ...prev, release_notes: e.target.value }))}
                    rows={3}
                />
                <p className="text-xs text-muted-foreground">{t('appUpdates.form.releaseNotesHelp')}</p>
            </div>

            {/* APK File Input - Only for create */}
            {!editVersion && (
                <div className="space-y-3">
                    <Label htmlFor="apk_file">{t('common.selectApk', {})}</Label>
                    <div className="flex items-center gap-4">
                        <Input
                            id="apk_file"
                            type="file"
                            accept=".apk"
                            onChange={(e) => setFile(e.target.files?.[0] || null)}
                            required
                            disabled={isSubmitting}
                            className="cursor-pointer"
                        />
                        {file && (
                            <span className="text-sm text-muted-foreground whitespace-nowrap">
                                {(file.size / (1024 * 1024)).toFixed(2)} MB
                            </span>
                        )}
                    </div>

                    {/* Enhanced Upload Progress */}
                    {isSubmitting && (
                        <div className="space-y-2 p-4 rounded-lg bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20">
                            <div className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2">
                                    <Upload className="h-4 w-4 animate-bounce text-blue-500" />
                                    <span className="font-medium">
                                        {uploadProgress < 100
                                            ? t('common.uploading', {})
                                            : t('common.processing', {})
                                        }
                                    </span>
                                </div>
                                <span className="font-bold text-blue-500">{uploadProgress}%</span>
                            </div>
                            <div className="relative h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div
                                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500 rounded-full transition-all duration-300 ease-out"
                                    style={{
                                        width: `${uploadProgress}%`,
                                        backgroundSize: '200% 100%',
                                        animation: uploadProgress < 100 ? 'shimmer 2s linear infinite' : 'none'
                                    }}
                                />
                            </div>
                            {file && (
                                <p className="text-xs text-muted-foreground text-center">
                                    {((file.size * uploadProgress) / (100 * 1024 * 1024)).toFixed(1)} MB / {(file.size / (1024 * 1024)).toFixed(1)} MB
                                </p>
                            )}
                        </div>
                    )}

                    <style>{`
                        @keyframes shimmer {
                            0% { background-position: 200% 0; }
                            100% { background-position: -200% 0; }
                        }
                    `}</style>
                </div>
            )}

            <div className="flex items-center space-x-3 p-4 border rounded-lg">
                <Checkbox
                    id="force_update"
                    checked={formData.force_update}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, force_update: !!checked }))}
                />
                <div className="flex-1">
                    <Label htmlFor="force_update" className="font-medium cursor-pointer">
                        {t('appUpdates.updateType.mandatory')}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                        {t('appUpdates.updateType.mandatoryDescription')}
                    </p>
                </div>
            </div>

            {formData.force_update && (
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                        {t('appUpdates.preview.mandatoryWarning')}
                    </AlertDescription>
                </Alert>
            )}

            <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
                    {t('appUpdates.actions.cancel')}
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting
                        ? (editVersion
                            ? t('appUpdates.actions.saving')
                            : t('appUpdates.actions.creating'))
                        : (editVersion
                            ? t('appUpdates.actions.save')
                            : t('appUpdates.actions.create'))}
                </Button>
            </div>
        </form>
    );
}
