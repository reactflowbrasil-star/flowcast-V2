import React, { useState } from 'react';
import { SecurityService } from '../../services/securityService';
import { BAN_TYPES, BAN_LEVELS } from '../../types/security';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import useLoadNamespace from '@/hooks/useLoadNamespace';

interface CreateBanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const CreateBanModal: React.FC<CreateBanModalProps> = ({ isOpen, onClose, onSuccess }) => {
  useLoadNamespace('admin/security');
  const { t } = useTranslation(['admin/security', 'translation']);
  const [formData, setFormData] = useState({
    username: '',
    ban_type: BAN_TYPES.TEMPORARY,
    ban_reason: '',
    ban_level: BAN_LEVELS.FIRST,
    custom_duration: ''});
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.username.trim() || !formData.ban_reason.trim()) {
      toast.error(t('notifications.ban.usernameAndReasonRequired'));
      return;
    }

    try {
      setLoading(true);

      let expires_at: string | undefined;
      
      if (formData.ban_type === BAN_TYPES.TEMPORARY) {
          if (formData.custom_duration) {
          // Custom duration in hours
          const hours = parseInt(formData.custom_duration);
          if (isNaN(hours) || hours <= 0) {
            toast.error(t('notifications.ban.invalidDuration'));
            return;
          }
          const expiryDate = new Date();
          expiryDate.setHours(expiryDate.getHours() + hours);
          expires_at = expiryDate.toISOString();
        } else {
          // Use predefined durations based on ban level
          const expiryDate = new Date();
          if (formData.ban_level === BAN_LEVELS.FIRST) {
            expiryDate.setMinutes(expiryDate.getMinutes() + 20);
            expires_at = expiryDate.toISOString();
          } else if (formData.ban_level === BAN_LEVELS.SECOND) {
            expiryDate.setHours(expiryDate.getHours() + 72);
            expires_at = expiryDate.toISOString();
          } else {
            expires_at = undefined; // Permanent
          }
        }
      }

      await SecurityService.createSecurityBan({
        username: formData.username.trim(),
        ban_type: formData.ban_type,
        ban_reason: formData.ban_reason.trim(),
        ban_level: formData.ban_level,
        expires_at});

      toast.success(t('notifications.ban.userBanned', { user: formData.username }));
      onSuccess();
      
      // Reset form
      setFormData({
        username: '',
        ban_type: BAN_TYPES.TEMPORARY,
        ban_reason: '',
        ban_level: BAN_LEVELS.FIRST,
        custom_duration: ''});
    } catch (error) {
      console.error('Error creating ban:', error);
      toast.error(t('notifications.ban.errorCreatingBan'));
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string | number | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 h-full w-full overflow-y-auto bg-background/70 backdrop-blur-sm">
      <div className="relative top-20 mx-auto w-96 rounded-md border border-border bg-card p-5 shadow-lg">
        <div className="mt-3">
          <h3 className="mb-4 text-lg font-medium text-foreground">{t('admin.createBan.title')}</h3>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div>
              <label className="mb-1 block text-sm font-medium text-muted-foreground">
                {t('admin.createBan.usernameLabel')}
              </label>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => handleInputChange('username', e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-primary"
                placeholder={t('admin.createBan.usernamePlaceholder')}
                required
              />
            </div>

            {/* Ban Type */}
            <div>
              <label className="mb-1 block text-sm font-medium text-muted-foreground">
                {t('admin.createBan.banTypeLabel')}
              </label>
              <select
                value={formData.ban_type}
                onChange={(e) => handleInputChange('ban_type', e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-primary"
              >
                <option value={BAN_TYPES.TEMPORARY}>{t('admin.createBan.temporary')}</option>
                <option value={BAN_TYPES.PERMANENT}>{t('admin.createBan.permanent')}</option>
              </select>
            </div>

            {/* Ban Level (for temporary bans) */}
            {formData.ban_type === BAN_TYPES.TEMPORARY && (
              <div>
                <label className="mb-1 block text-sm font-medium text-muted-foreground">
                  {t('admin.createBan.banLevelLabel')}
                </label>
                <select
                  value={formData.ban_level}
                  onChange={(e) => handleInputChange('ban_level', parseInt(e.target.value))}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-primary"
                >
                  <option value={BAN_LEVELS.FIRST}>{t('admin.createBan.level1')}</option>
                  <option value={BAN_LEVELS.SECOND}>{t('admin.createBan.level2')}</option>
                  <option value={BAN_LEVELS.PERMANENT}>{t('admin.createBan.level3')}</option>
                </select>
              </div>
            )}

            {/* Custom Duration (for temporary bans) */}
            {formData.ban_type === BAN_TYPES.TEMPORARY && (
              <div>
                <label className="mb-1 block text-sm font-medium text-muted-foreground">
                  {t('admin.createBan.customDurationLabel')}
                </label>
                <input
                  type="number"
                  value={formData.custom_duration}
                  onChange={(e) => handleInputChange('custom_duration', e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-primary"
                  placeholder={t('admin.createBan.customDurationPlaceholder')}
                  min="1"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('admin.createBan.customDurationNote')}
                </p>
              </div>
            )}

            {/* Ban Reason */}
            <div>
              <label className="mb-1 block text-sm font-medium text-muted-foreground">
                {t('admin.createBan.reasonLabel')}
              </label>
              <textarea
                value={formData.ban_reason}
                onChange={(e) => handleInputChange('ban_reason', e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-primary"
                rows={3}
                placeholder={t('admin.createBan.reasonPlaceholder')}
                required
              />
            </div>

            {/* Buttons */}
            <div className="flex items-center justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={loading}
                className="rounded-md border border-transparent bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground shadow-sm hover:bg-destructive/90 focus:outline-none focus:ring-2 focus:ring-destructive focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? t('common.loading', { ns: 'translation' }) : t('common.create', { ns: 'translation' })}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CreateBanModal;
