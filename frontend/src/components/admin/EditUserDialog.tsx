import React, { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle } from 'lucide-react';
import { userService } from '@/services';
import { User } from '@/types';
import { useCategoriesAdmin } from '@/hooks/useCategories';
import { getDisplayCategoryName } from '@/lib/categoryUtils';
import { useTranslation } from 'react-i18next';
import useLoadNamespace from '@/hooks/useLoadNamespace';

interface EditUserDialogProps {
  user: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function EditUserDialog({ user, open, onOpenChange }: EditUserDialogProps) {
  useLoadNamespace('admin/endUserManagement');
  const { t } = useTranslation(['admin/endUserManagement', 'admin', 'translation']);
  const queryClient = useQueryClient();
  const { data: categories, isLoading: categoriesLoading } = useCategoriesAdmin();

  // Validation schema for editing user details
  const editUserSchema = useMemo(() => z.object({
    username: z.string().min(3, t('endUserManagement.form.validation.usernameMin', {})),
    email: z.string().email(t('endUserManagement.form.validation.emailInvalid', {})),
    password: z
      .string()
      .min(4, t('endUserManagement.form.validation.passwordMin', {}))
      .max(10, t('endUserManagement.form.validation.passwordMax', {}))
      .regex(/^\d+$/, t('endUserManagement.form.validation.passwordDigits', {}))
      .optional()
      .or(z.literal('')),
    max_devices: z.number().min(1).max(10, t('endUserManagement.form.validation.maxDevices', {})),
    active: z.boolean(),
    expires_at: z.string().optional(),
    category_ids: z.array(z.number()).optional()}), [t]);

  type EditUserData = z.infer<typeof editUserSchema>;

  // Edit user form
  const editForm = useForm<EditUserData>({
    resolver: zodResolver(editUserSchema),
    defaultValues: {
      username: '',
      email: '',
      password: '',
      max_devices: 3,
      active: true,
      expires_at: '',
      category_ids: []}});

  // Reset form when user changes
  useEffect(() => {
    if (user && categories) {
      // Get user's current category IDs - handle both array of objects and array of IDs
      const userCategoryIds = (user.subscribed_categories as Array<number | { id: number }>)?.map(cat =>
        typeof cat === 'object' && cat !== null ? cat.id : cat
      ) || [];

      editForm.reset({
        username: user.username,
        email: user.email || '',
        password: '', // Don't pre-fill password
        max_devices: user.max_devices,
        active: user.active,
        expires_at: user.expires_at ? new Date(user.expires_at).toISOString().split('T')[0] : '',
        category_ids: userCategoryIds});
    }
  }, [user, categories, editForm]);

  // Edit user mutation
  const editUserMutation = useMutation({
    mutationFn: async (data: EditUserData) => {
      if (!user) throw new Error(t('endUserManagement.messages.noUserSelected'));

      // Update basic user info
      const updateData = {
        username: data.username,
        email: data.email,
        max_devices: data.max_devices,
        active: data.active,
        expires_at: data.expires_at ? new Date(data.expires_at).toISOString() : undefined,
        category_ids: data.category_ids};

      const updateResult = await userService.updateUser(user.id, updateData);
      if (!updateResult.success) {
        throw new Error(updateResult.error?.details ?? t('endUserManagement.messages.updateFailed'));
      }

      // Update password if provided
      if (data.password && data.password.trim() !== '') {
        const passwordResult = await userService.resetUserPassword(user.id, data.password);
        if (!passwordResult.success) {
          throw new Error(passwordResult.error?.details ?? t('endUserManagement.messages.passwordUpdateFailed'));
        }
      }

      return updateResult.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-end-users'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      onOpenChange(false);
    }});

  const handleEditSubmit = (data: EditUserData) => {
    editUserMutation.mutate(data);
  };

  const handleClose = () => {
    onOpenChange(false);
    editForm.reset();
    editUserMutation.reset();
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('endUserManagement.editDialog.title')} : {user.username}</DialogTitle>
          <DialogDescription>
            {t('endUserManagement.editDialog.description', {})}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={editForm.handleSubmit(handleEditSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="edit-username">{t('endUserManagement.form.username')}</Label>
            <Input
              id="edit-username"
              {...editForm.register('username')}
              placeholder={t('placeholders.enterUsername', {})}
            />
            {editForm.formState.errors.username && (
              <p className="text-sm text-destructive mt-1">
                {editForm.formState.errors.username.message}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="edit-email">{t('endUserManagement.form.email')}</Label>
            <Input
              id="edit-email"
              type="email"
              {...editForm.register('email')}
              placeholder={t('placeholders.userEmail', {})}
            />
            {editForm.formState.errors.email && (
              <p className="text-sm text-destructive mt-1">
                {editForm.formState.errors.email.message}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="edit-password">{t('endUserManagement.form.password')}</Label>
            <Input
              id="edit-password"
              type="password"
              {...editForm.register('password')}
              placeholder={t('endUserManagement.editDialog.passwordDesc')}
            />
            {editForm.formState.errors.password && (
              <p className="text-sm text-destructive mt-1">
                {editForm.formState.errors.password.message}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="edit-expires-at">{t('endUserManagement.form.expiryDate')}</Label>
            <Input
              id="edit-expires-at"
              type="date"
              {...editForm.register('expires_at')}
            />
            {editForm.formState.errors.expires_at && (
              <p className="text-sm text-destructive mt-1">
                {editForm.formState.errors.expires_at.message}
              </p>
            )}
            <p className="text-sm text-muted-foreground mt-1">
              {t('endUserManagement.form.expiryDateHelp')}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="edit-max-devices">{t('endUserManagement.form.maxDevices')}</Label>
              <Input
                id="edit-max-devices"
                type="number"
                min="1"
                max="10"
                {...editForm.register('max_devices', { valueAsNumber: true })}
              />
              {editForm.formState.errors.max_devices && (
                <p className="text-sm text-destructive mt-1">
                  {editForm.formState.errors.max_devices.message}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="edit-active">{t('endUserManagement.table.status')}</Label>
              <Select
                value={editForm.watch('active') ? 'true' : 'false'}
                onValueChange={(value) => editForm.setValue('active', value === 'true')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">{t('common.active', {})}</SelectItem>
                  <SelectItem value="false">{t('common.suspended', {})}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>{t('endUserManagement.form.selectContentCategories')}</Label>
            <div className="space-y-3 mt-2">
              {categoriesLoading ? (
                <p className="text-sm text-muted-foreground">{t('endUserManagement.form.loadingCategories')}</p>
              ) : categories && categories.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {categories.map((category) => {
                    const isSelected = editForm.watch('category_ids')?.includes(category.id) || false;
                    return (
                      <Button
                        key={category.id}
                        type="button"
                        variant={isSelected ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          const currentIds = editForm.getValues('category_ids') || [];
                          if (isSelected) {
                            // Remove category
                            editForm.setValue(
                              'category_ids',
                              currentIds.filter(id => id !== category.id)
                            );
                          } else {
                            // Add category
                            editForm.setValue('category_ids', [...currentIds, category.id]);
                          }
                        }}
                      >
                        {getDisplayCategoryName(category.name)}
                      </Button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t('endUserManagement.form.noCategories')}</p>
              )}
            </div>
            {editForm.formState.errors.category_ids && (
              <p className="text-sm text-destructive mt-1">
                {editForm.formState.errors.category_ids.message}
              </p>
            )}
            <p className="text-sm text-muted-foreground mt-1">
              {t('endUserManagement.form.selectCategoriesHelp')}
            </p>
          </div>

          {editUserMutation.error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {editUserMutation.error.message}
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
            >
              {t('endUserManagement.editDialog.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={editUserMutation.isPending}
            >
              {editUserMutation.isPending ? t('endUserManagement.editDialog.updating') : t('endUserManagement.editDialog.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
