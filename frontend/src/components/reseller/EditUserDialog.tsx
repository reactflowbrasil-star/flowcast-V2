'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, Calendar, Smartphone, Clock, Plus } from 'lucide-react';
import { userService } from '@/services';
import { resellerService } from '@/services/reseller';
import { User } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { useResellerCredits } from '@/hooks/useResellerCredits';
import { useCategories } from '@/hooks/useCategories';
import { getDisplayCategoryName } from '@/lib/categoryUtils';

type ExtendSubscriptionData = {
  extension_months: number;
};

type EditUserData = {
  username: string;
  email: string;
  password?: string;
  max_devices: number;
  category_ids: number[];
};

// Helper function to calculate credits for extension
const calculateExtensionCredits = (extensionMonths: number, maxDevices: number): number => {
  // Base cost for 3 devices = 1 credit per month
  let creditsPerMonth = 1;

  if (maxDevices > 3) {
    // Each additional device after 3 costs 0.25 credits per month
    const extraDevices = maxDevices - 3;
    creditsPerMonth = 1 + (extraDevices * 0.25);
  }

  return extensionMonths * creditsPerMonth;
};

interface EditUserDialogProps {
  user: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function EditUserDialog({ user, open, onOpenChange }: EditUserDialogProps) {
  const { t } = useTranslation('reseller');
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const { data: categories, isLoading: categoriesLoading } = useCategories();
  const { data: creditBalance } = useResellerCredits();

  // State for credit warning
  const [creditWarning, setCreditWarning] = useState<{
    show: boolean;
    additionalDevices: number;
    creditCost: number;
    remainingDays: number;
  }>({ show: false, additionalDevices: 0, creditCost: 0, remainingDays: 0 });
  const extendSubscriptionSchema = useMemo(() => z.object({
    extension_months: z.number()
      .min(1, t('editUser.validation.minMonth'))
      .max(12, t('editUser.validation.maxExtension'))
  }), [t]);
  const editUserSchema = useMemo(() => z.object({
    username: z.string().min(3, t('editUser.validation.usernameMinLength')),
    email: z.string().email(t('editUser.validation.invalidEmail')),
    password: z.string()
      .min(4, t('editUser.validation.passwordMinLength'))
      .max(10, t('editUser.validation.passwordMaxLength'))
      .regex(/^\d+$/, t('editUser.validation.passwordDigitsOnly'))
      .optional()
      .or(z.literal('')),
    max_devices: z.number()
      .min(1)
      .max(10, t('editUser.validation.maxDevicesLimit')),
    category_ids: z.array(z.number()).min(1, t('editUser.validation.selectCategory'))
  }), [t]);

  const form = useForm<ExtendSubscriptionData>({
    resolver: zodResolver(extendSubscriptionSchema),
    defaultValues: {
      extension_months: 1}});

  // Edit user form
  const editForm = useForm<EditUserData>({
    resolver: zodResolver(editUserSchema),
    defaultValues: {
      username: '',
      email: '',
      password: '',
      max_devices: 3,
      category_ids: []}});

  // Watch form values for real-time credit calculation
  const watchedExtensionMonths = form.watch('extension_months');

  // Calculate extension cost in real-time
  const extensionCost = useMemo(() => {
    if (!user || !watchedExtensionMonths) {
      return { cost: 0, breakdown: t('editUser.extend.selectExtension') };
    }

    const cost = calculateExtensionCredits(watchedExtensionMonths, user.max_devices || 3);
    const devices = user.max_devices || 3;
    const creditsPerMonth = cost / watchedExtensionMonths;

    const monthLabel = watchedExtensionMonths > 1
      ? t('endUsers.monthsPlural')
      : t('endUsers.monthPlural');
    const deviceLabel = devices > 1
      ? t('editUser.extend.breakdown.devicesPlural')
      : t('editUser.extend.breakdown.device');

    let breakdown = t('editUser.extend.breakdown.monthsDevices', {
      months: watchedExtensionMonths,
      monthLabel,
      devices,
      deviceLabel
    });

    breakdown += devices === 3
      ? ` ${t('editUser.extend.breakdown.oneCredit')}`
      : ` ${t('editUser.extend.breakdown.extraDevices', {
          extraDevices: devices - 3,
          creditsPerMonth
        })}`;

    const creditLabel = cost === 1
      ? t('editUser.extend.breakdown.credit')
      : t('editUser.extend.breakdown.creditsPlural');
    breakdown += ` ${t('editUser.extend.breakdown.totalCredits', { cost, creditLabel })}`;

    return { cost, breakdown };
  }, [user, watchedExtensionMonths, t]);

  // Check if reseller has enough credits
  const hasEnoughCredits = useMemo(() => {
    const availableCredits = creditBalance?.credits || currentUser?.credits || 0;
    return availableCredits >= extensionCost.cost;
  }, [creditBalance?.credits, currentUser?.credits, extensionCost.cost]);

  // Reset forms when user changes
  useEffect(() => {
    if (user && categories) {
      // Get user's current category IDs - handle both arrays of objects and IDs
      const userCategoryIds = (user.subscribed_categories as Array<number | { id: number }>)?.map(cat =>
        typeof cat === 'object' && cat !== null ? cat.id : cat
      ) || [];
      form.reset({
        extension_months: 1});

      // Reset edit form with current user data
      editForm.reset({
        username: user.username,
        email: user.email || '',
        password: '', // Don't pre-fill password
        max_devices: user.max_devices,
        category_ids: userCategoryIds});
    }
  }, [user, categories, form, editForm]);

  // Calculate credit cost when max_devices changes
  const calculateCreditCost = (newMaxDevices: number) => {
    if (!user || newMaxDevices <= user.max_devices) {
      setCreditWarning({ show: false, additionalDevices: 0, creditCost: 0, remainingDays: 0 });
      return;
    }

    const additionalDevices = newMaxDevices - user.max_devices;
    const costPerDevicePerMonth = 0.25;
    const additionalCostPerMonth = additionalDevices * costPerDevicePerMonth;

    // Calculate remaining days
    let remainingDays = 30; // Default
    if (user.expires_at) {
      const expirationDate = new Date(user.expires_at);
      const now = new Date();
      if (expirationDate > now) {
        remainingDays = Math.ceil((expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      } else {
        remainingDays = 0;
      }
    }

    // Calculate proportional cost: (cost_per_month * remaining_days) / 30
    const totalCreditCost = (additionalCostPerMonth * remainingDays) / 30;

    setCreditWarning({
      show: totalCreditCost > 0,
      additionalDevices,
      creditCost: totalCreditCost,
      remainingDays});
  };

  // Extend subscription mutation
  const extendSubscriptionMutation = useMutation({
    mutationFn: async (data: ExtendSubscriptionData) => {
      if (!user) throw new Error(t('editUser.errors.noUserSelected'));

      // Use current user's categories for extension
      const userCategoryIds = (user.subscribed_categories as Array<number | { id: number }>)?.map(cat =>
        typeof cat === 'object' && cat !== null ? cat.id : cat
      ) || [];
      const extensionData = {
        extension_months: data.extension_months,
        category_ids: userCategoryIds};

      const result = await userService.extendUserSubscription(user.id, extensionData);
      if (result.success) {
        return result.data;
      }
      throw new Error(result.error?.details || t('editUser.errors.extendFailed'));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reseller-users'] });
      onOpenChange(false);
    }});

  // Edit user mutation
  const editUserMutation = useMutation({
    mutationFn: async (data: EditUserData) => {
      if (!user) throw new Error(t('editUser.errors.noUserSelected'));

      // Update basic user info using reseller service
      const updateData = {
        username: data.username,
        email: data.email,
        max_devices: data.max_devices,
        category_ids: data.category_ids};

      const updateResult = await resellerService.updateEndUser(user.id, updateData);
      if (!updateResult.success) {
        throw new Error(updateResult.error.details);
      }

      // Update password if provided
      if (data.password && data.password.trim() !== '') {
        const passwordResult = await userService.resetUserPassword(user.id, data.password);
        if (!passwordResult.success) {
          throw new Error(passwordResult.error.details);
        }
      }

      return updateResult.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reseller-users'] });
      onOpenChange(false);
    }});

  const handleExtensionSubmit = (data: ExtendSubscriptionData) => {
    extendSubscriptionMutation.mutate(data);
  };

  const handleEditSubmit = (data: EditUserData) => {

    editUserMutation.mutate(data);
  };

  const handleClose = () => {
    onOpenChange(false);
    form.reset();
    editForm.reset();
    extendSubscriptionMutation.reset();
    editUserMutation.reset();
  };

  if (!user) return null;

  // Calculate remaining time
  const now = new Date();
  const expiryDate = new Date(user.expires_at || now);
  const isExpired = expiryDate <= now;
  const daysRemaining = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="!max-w-[65vw] !w-[65vw] max-h-[75vh] overflow-y-auto sm:!max-w-[65vw] md:!max-w-[65vw] lg:!max-w-[65vw]" style={{ width: '65vw', maxWidth: '65vw' }}>
        <DialogHeader>
          <DialogTitle>{t('editUser.dialogTitle', { username: user.username })}</DialogTitle>
          <DialogDescription>
            {t('editUser.dialogDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Edit User Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                {t('editUser.editDetailsTitle')}
              </CardTitle>
              <CardDescription>
                {t('editUser.editDetailsDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={editForm.handleSubmit(handleEditSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="edit-username">{t('editUser.labels.username')}</Label>
                    <Input
                      id="edit-username"
                      {...editForm.register('username')}
                      placeholder={t('editUser.placeholders.enterUsername')}
                    />
                    {editForm.formState.errors.username && (
                      <p className="text-sm text-red-600 mt-1">
                        {editForm.formState.errors.username.message}
                      </p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="edit-email">{t('editUser.labels.email')}</Label>
                    <Input
                      id="edit-email"
                      type="email"
                      {...editForm.register('email')}
                      placeholder={t('editUser.placeholders.enterEmail')}
                    />
                    {editForm.formState.errors.email && (
                      <p className="text-sm text-red-600 mt-1">
                        {editForm.formState.errors.email.message}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="edit-password">{t('editUser.labels.newPassword')}</Label>
                    <Input
                      id="edit-password"
                      type="password"
                      {...editForm.register('password')}
                      placeholder={t('editUser.placeholders.leaveEmptyToKeep')}
                    />
                    {editForm.formState.errors.password && (
                      <p className="text-sm text-red-600 mt-1">
                        {editForm.formState.errors.password.message}
                      </p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="edit-max-devices">{t('editUser.labels.maxDevices')}</Label>
                    <Input
                      id="edit-max-devices"
                      type="number"
                      min="1"
                      max="10"
                      {...editForm.register('max_devices', {
                        valueAsNumber: true,
                        setValueAs: (value) => value === '' ? undefined : Number(value),
                        onChange: (e) => {
                          const newValue = Number(e.target.value);
                          if (!isNaN(newValue)) {
                            calculateCreditCost(newValue);
                          }
                        }
                      })}
                    />
                    {editForm.formState.errors.max_devices && (
                      <p className="text-sm text-red-600 mt-1">
                        {editForm.formState.errors.max_devices.message}
                      </p>
                    )}

                    {/* Credit Warning */}
                    {creditWarning.show && (
                      <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                        <div className="flex items-start">
                          <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5 mr-2" />
                          <div className="text-sm">
                            <p className="font-medium text-yellow-800">{t('editUser.creditWarning.title')}</p>
                            <p className="text-yellow-700 mt-1">
                              {creditWarning.additionalDevices === 1
                                ? t('editUser.creditWarning.addingDevices', { count: creditWarning.additionalDevices })
                                : t('editUser.creditWarning.addingDevicesPlural', { count: creditWarning.additionalDevices })}{' '}
                              <span className="font-semibold">
                                {t('editUser.creditWarning.credits', { amount: creditWarning.creditCost.toFixed(3) })}
                              </span>
                            </p>
                            <p className="text-yellow-600 text-xs mt-1">
                              {t('editUser.creditWarning.calculation', { days: creditWarning.remainingDays })}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Categories Selection */}
                <div>
                  <Label className="text-sm font-medium">{t('editUser.labels.categories')}</Label>
                  <div className="space-y-3 mt-2">
                    {categoriesLoading ? (
                      <p className="text-sm text-gray-500">{t('editUser.loading.categories')}</p>
                    ) : categories && categories.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {categories.map((category) => {
                          const isSelected = editForm.watch('category_ids').includes(category.id);
                          return (
                            <Button
                              key={category.id}
                              type="button"
                              variant={isSelected ? "default" : "outline"}
                              size="sm"
                              onClick={() => {
                                const currentIds = editForm.getValues('category_ids');
                                if (isSelected) {
                                  editForm.setValue('category_ids', currentIds.filter(id => id !== category.id));
                                } else {
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
                      <p className="text-sm text-gray-500">{t('editUser.empty.noCategories')}</p>
                    )}
                  </div>
                  {editForm.formState.errors.category_ids && (
                    <p className="text-sm text-red-600 mt-1">
                      {editForm.formState.errors.category_ids.message}
                    </p>
                  )}
                </div>

                {editUserMutation.error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      {editUserMutation.error.message}
                    </AlertDescription>
                  </Alert>
                )}

                <div className="flex justify-end">
                  <Button
                    type="submit"
                    disabled={editUserMutation.isPending}
                  >
                    {editUserMutation.isPending ? t('editUser.buttons.updating') : t('editUser.buttons.updateUser')}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Current Subscription Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                {t('editUser.subscription.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-gray-600">{t('editUser.labels.username')}</Label>
                  <p className="font-medium">{user.username}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-600">{t('editUser.labels.email')}</Label>
                  <p className="font-medium">{user.email}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-600">{t('editUser.labels.deviceLimit')}</Label>
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-4 w-4" />
                    <span className="font-medium">{t('editUser.subscription.devices', { count: user.max_devices || 3 })}</span>
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-600">{t('editUser.labels.status')}</Label>
                  <div className="flex items-center gap-2">
                    {isExpired ? (
                      <Badge variant="destructive">{t('editUser.subscription.expired')}</Badge>
                    ) : (
                      <Badge variant="default">{t('editUser.subscription.active')}</Badge>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium text-gray-600">{t('editUser.labels.expirationDate')}</Label>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <span className="font-medium">
                    {expiryDate.toLocaleDateString()}
                    {!isExpired && (
                      <span className="text-sm text-gray-500 ml-2">
                        {t('endUsers.time.daysRemaining', { days: daysRemaining })}
                      </span>
                    )}
                  </span>
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium text-gray-600">{t('editUser.labels.currentCategories')}</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {user.subscribed_categories && user.subscribed_categories.length > 0 ? (
                    (user.subscribed_categories as Array<number | { id: number; name?: string }>).map((category) => {
                      const catId = typeof category === 'object' && category !== null ? category.id : category;
                      const catName = typeof category === 'object' && category !== null && 'name' in category
                        ? category.name
                        : `${t('common.category')} ${catId}`;
                      return (
                        <Badge key={catId} variant="outline">
                          {getDisplayCategoryName(catName || '')}
                        </Badge>
                      );
                    })
                  ) : (
                    <span className="text-sm text-gray-500">{t('editUser.subscription.noCategories')}</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Extension Form */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                {t('editUser.extend.title')}
              </CardTitle>
              <CardDescription>
                {t('editUser.extend.description')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={form.handleSubmit(handleExtensionSubmit)} className="space-y-4">
                <div>
                  <Label>{t('editUser.extend.periodLabel')}</Label>
                  <Select
                    value={watchedExtensionMonths?.toString() || '1'}
                    onValueChange={(value) => form.setValue('extension_months', parseInt(value))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('editUser.extend.selectPeriod')} />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((months) => (
                        <SelectItem key={months} value={months.toString()}>
                          {t('endUsers.duration.month', { count: months })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.formState.errors.extension_months && (
                    <p className="text-sm text-red-600 mt-1">
                      {form.formState.errors.extension_months.message}
                    </p>
                  )}
                </div>



                {/* Credit Cost Calculation */}
                <Alert className={hasEnoughCredits ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-2">
                      <div className="font-medium">{t('editUser.extend.costCalculation')}</div>
                      <div className="text-sm">{extensionCost.breakdown}</div>
                      <div className="font-bold text-lg">
                        {t('editUser.extend.breakdown.totalCredits', {
                          cost: extensionCost.cost,
                          creditLabel: extensionCost.cost === 1
                            ? t('editUser.extend.breakdown.credit')
                            : t('editUser.extend.breakdown.creditsPlural')
                        })}
                      </div>
                      <div className="text-sm">
                        {t('editUser.extend.availableCredits')}: {creditBalance?.credits || currentUser?.credits || 0}
                      </div>
                      {!hasEnoughCredits && extensionCost.cost > 0 && (
                        <div className="text-red-600 font-medium">
                          {t('editUser.extend.insufficientCredits')} {t('editUser.extend.needMoreCredits', {
                            amount: extensionCost.cost - (creditBalance?.credits || currentUser?.credits || 0)
                          })}
                        </div>
                      )}
                    </div>
                  </AlertDescription>
                </Alert>

                {extendSubscriptionMutation.error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      {extendSubscriptionMutation.error.message}
                    </AlertDescription>
                  </Alert>
                )}

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClose}
                  >
                    {t('editUser.buttons.cancel')}
                  </Button>
                  <Button
                    type="submit"
                    disabled={extendSubscriptionMutation.isPending || !hasEnoughCredits || extensionCost.cost === 0}
                  >
                    {extendSubscriptionMutation.isPending ? t('editUser.buttons.extending') :
                      !hasEnoughCredits ? t('editUser.buttons.insufficientCredits') :
                        extensionCost.cost === 0 ? t('editUser.extend.selectExtension') :
                          t('editUser.buttons.extendSubscription', { cost: extensionCost.cost })}
                  </Button>
                </DialogFooter>
              </form>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
