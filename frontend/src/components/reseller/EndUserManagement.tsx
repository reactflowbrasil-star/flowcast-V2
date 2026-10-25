'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Edit, Ban, Trash2, Smartphone, Users, AlertCircle, CheckCircle, XCircle, Calculator, Clock, Timer } from 'lucide-react';
import { userService } from '@/services';
import { resellerService } from '@/services/reseller';
import { User } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import EditUserDialog from './EditUserDialog';
import { useCategories } from '@/hooks/useCategories';
import { useResellerCredits } from '@/hooks/useResellerCredits';
import { getDisplayCategoryName } from '@/lib/categoryUtils';
import { useUsernameValidation } from '@/hooks/useUsernameValidation';
import { UsernameInputWithValidation } from '@/components/ui/username-validator';

type CreateEndUserData = {
  username: string;
  password: string;
  email: string;
  duration_months: number;
  max_devices: '3' | '5' | '6' | '7' | '8' | '9' | '10';
  category_ids: number[];
};

interface EndUserManagementProps {
  className?: string;
  autoOpenCreate?: boolean;
}

// Helper function to calculate demo time remaining
const getDemoTimeRemaining = (demoExpiresAt: string | undefined, t: (key: string, options?: any) => string) => {
  if (!demoExpiresAt) return null;

  const now = new Date();
  const expiresAt = new Date(demoExpiresAt);
  const diffMs = expiresAt.getTime() - now.getTime();

  if (diffMs <= 0) return { expired: true, text: t('reseller.endUsers.time.expired') };

  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;

  if (hours > 0) {
    return { expired: false, text: t('reseller.endUsers.time.hoursMinutes', { hours, minutes }) };
  } else {
    return { expired: false, text: t('reseller.endUsers.time.minutes', { minutes }) };
  }
};

// Helper function to calculate license expiration status
const getLicenseExpirationStatus = (expiresAt: string | undefined, t: (key: string, options?: any) => string) => {
  if (!expiresAt) return { status: 'never', text: t('reseller.endUsers.time.never'), daysRemaining: null };

  const now = new Date();
  const expirationDate = new Date(expiresAt);
  const diffMs = expirationDate.getTime() - now.getTime();
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (daysRemaining <= 0) {
    return { status: 'expired', text: t('reseller.endUsers.time.expired'), daysRemaining: 0 };
  } else if (daysRemaining <= 7) {
    return { status: 'critical', text: t('reseller.endUsers.time.days', { days: daysRemaining }), daysRemaining };
  } else if (daysRemaining <= 30) {
    return { status: 'warning', text: t('reseller.endUsers.time.days', { days: daysRemaining }), daysRemaining };
  } else {
    return { status: 'good', text: expirationDate.toLocaleDateString(), daysRemaining };
  }
};

// Helper function to calculate credits automatically
const calculateCredits = (durationMonths: number, maxDevices: string): number => {
  const devices = parseInt(maxDevices);

  // Base cost for 3 devices = 1 credit per month
  let creditsPerMonth = 1;

  if (devices > 3) {
    // Each additional device after 3 costs 0.25 credits per month
    const extraDevices = devices - 3;
    creditsPerMonth = 1 + (extraDevices * 0.25);
  }

  return durationMonths * creditsPerMonth;
};



export default function EndUserManagement({ className, autoOpenCreate = false }: EndUserManagementProps) {
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(autoOpenCreate);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const { data: creditBalance } = useResellerCredits();
  const { t } = useTranslation();
  const createEndUserSchema = React.useMemo(() => z.object({
    username: z.string().min(3, t('reseller.endUsers.validation.usernameMin')),
    password: z
      .string()
      .min(4, t('reseller.endUsers.validation.passwordMin'))
      .max(10, t('reseller.endUsers.validation.passwordMax'))
      .regex(/^\d+$/, t('reseller.endUsers.validation.passwordDigits')),
    email: z.string().email(t('reseller.endUsers.validation.invalidEmail')),
    duration_months: z.number().min(1, t('reseller.endUsers.validation.durationMin')).max(12, t('reseller.endUsers.validation.durationMax')),
    max_devices: z.enum(['3', '5', '6', '7', '8', '9', '10'], { message: t('reseller.endUsers.validation.selectDeviceLimit') }),
    category_ids: z.array(z.number()).min(1, t('reseller.endUsers.validation.selectCategory')),
  }), [t]);

  // Note: Removed system config call as resellers don't need admin configuration

  // Fetch reseller's users (only users created by this reseller)
  const { data: endUsers, isLoading, error } = useQuery({
    queryKey: ['reseller-users', currentUser?.id],
    queryFn: async () => {
      const result = await resellerService.getEndUsers();
      if (result.success) {
        return result.data;
      }
      throw new Error(result.error.details);
    },
    enabled: !!currentUser?.id});

  // Fetch available categories
  const { data: categories, isLoading: categoriesLoading } = useCategories();

  // Update current time every minute to refresh demo timers
  const [currentTime, setCurrentTime] = React.useState(new Date());
  React.useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  // Create end user form
  const createForm = useForm<CreateEndUserData>({
    resolver: zodResolver(createEndUserSchema),
    defaultValues: {
      username: '',
      password: '',
      email: '',
      duration_months: 1,
      max_devices: '3',
      category_ids: []}});

  // Username validation
  const watchedUsername = createForm.watch('username');
  const usernameValidation = useUsernameValidation(watchedUsername);

  // Watch form values for real-time credit calculation
  const watchedDuration = createForm.watch('duration_months');
  const watchedDevices = createForm.watch('max_devices');

  // Calculate credit cost in real-time
  const creditCost = React.useMemo(() => {
    if (!watchedDuration || !watchedDevices) return { cost: 0, breakdown: t('reseller.endUsers.selectDurationAndDevices') };

    const cost = calculateCredits(watchedDuration, watchedDevices);
    const devices = parseInt(watchedDevices);
    const creditsPerMonth = cost / watchedDuration;
    const durationUnit = watchedDuration > 1
      ? t('reseller.endUsers.monthsPlural')
      : t('reseller.endUsers.monthPlural');
    const costUnit = creditsPerMonth > 1
      ? t('reseller.endUsers.creditsPerMonth')
      : t('reseller.endUsers.creditPerMonth');
    const breakdown = t('reseller.endUsers.creditBreakdown', {
      duration: watchedDuration,
      durationUnit,
      devices,
      devicePlural: devices > 1 ? 's' : '',
      costPerMonth: Number.isInteger(creditsPerMonth) ? String(creditsPerMonth) : creditsPerMonth.toFixed(2),
      costUnit,
      total: cost,
      creditPlural: cost !== 1 ? 's' : '',
    });

    return { cost, breakdown };
  }, [t, watchedDuration, watchedDevices]);

  // Check if reseller has enough credits
  const hasEnoughCredits = creditBalance?.credits ? creditBalance.credits >= creditCost.cost : false;

  // Create end user mutation
  const createEndUserMutation = useMutation({
    mutationFn: async (data: CreateEndUserData) => {
      // Calculate expiry date
      const expiryDate = new Date();
      expiryDate.setMonth(expiryDate.getMonth() + data.duration_months);

      const result = await resellerService.createEndUser({
        username: data.username,
        password: data.password,
        email: data.email,
        max_devices: parseInt(data.max_devices),
        expires_at: expiryDate.toISOString(),
        category_ids: data.category_ids});
      if (result.success) {
        return result.data;
      }
      throw new Error(result.error.details);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reseller-users'] });
      queryClient.invalidateQueries({ queryKey: ['reseller-credits'] }); // Refresh credits
      setIsCreateDialogOpen(false);
      createForm.reset();
    }});

  // Toggle user status mutation
  const toggleUserStatusMutation = useMutation({
    mutationFn: async ({ userId, active }: { userId: number; active: boolean }) => {
      const result = await userService.toggleUserStatus(userId, active);
      if (result.success) {
        return result.data;
      }
      throw new Error(result.error.details);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reseller-users'] });
    }});

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      const result = await userService.deleteEndUser(userId);
      if (!result.success) {
        throw new Error(result.error?.details || t('common.serverError'));
      }
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reseller-users'] });
    }});

  const handleCreateEndUser = (data: CreateEndUserData) => {
    createEndUserMutation.mutate(data);
  };

  const handleToggleUserStatus = (user: User) => {
    toggleUserStatusMutation.mutate({
      userId: user.id,
      active: !user.active});
  };

  const openEditDialog = (user: User) => {
    setSelectedUser(user);
    setIsEditDialogOpen(true);
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>{t('uiBulk.endUsers.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>{t('uiBulk.endUsers.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {t('reseller.endUsers.errors.failedToLoadUsers')}: {error.message}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{t('uiBulk.endUsers.title')}</CardTitle>
            <CardDescription>
              {t('uiBulk.endUsers.subtitle')}
            </CardDescription>
            <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-orange-500/10 border border-orange-500/20 rounded"></div>
                <span>{t('reseller.endUsers.legend.demoUser')}</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-destructive/10 border border-destructive/20 rounded"></div>
                <span>{t('reseller.endUsers.legend.expiredDemo')}</span>
              </div>
              <div className="flex items-center gap-1">
                <Badge variant="secondary" className="bg-orange-500/10 text-orange-600 text-xs">
                  <Clock className="h-2 w-2 mr-1" />
                  {t('reseller.endUsers.badges.demo')}
                </Badge>
                <span>{t('reseller.endUsers.legend.demoBadge')}</span>
              </div>
            </div>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                {t('uiBulk.createEndUser')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('uiBulk.createEndUser')}</DialogTitle>
                <DialogDescription>
                  {t('reseller.endUsers.createDialogDescription')}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={createForm.handleSubmit(handleCreateEndUser)} className="space-y-4">
                <div>
                  <Label htmlFor="username">{t('common.username')}</Label>
                  <UsernameInputWithValidation
                    value={watchedUsername}
                    onChange={(value) => createForm.setValue('username', value)}
                    validation={usernameValidation}
                    placeholder={t('login.usernamePlaceholder')}
                  />
                  {createForm.formState.errors.username && (
                    <p className="text-sm text-destructive mt-1">
                      {createForm.formState.errors.username.message}
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="password">{t('common.password')}</Label>
                  <Input
                    id="password"
                    type="password"
                    {...createForm.register('password')}
                    placeholder={t('login.passwordPlaceholder')}
                  />
                  {createForm.formState.errors.password && (
                    <p className="text-sm text-destructive mt-1">
                      {createForm.formState.errors.password.message}
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="email">{t('common.email')}</Label>
                  <Input
                    id="email"
                    type="email"
                    {...createForm.register('email')}
                    placeholder={t('profile.emailPlaceholder')}
                  />
                  {createForm.formState.errors.email && (
                    <p className="text-sm text-destructive mt-1">
                      {createForm.formState.errors.email.message}
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="duration_months">{t('reseller.endUsers.subscriptionDuration')}</Label>
                  <Select
                    value={createForm.watch('duration_months')?.toString()}
                    onValueChange={(value) => createForm.setValue('duration_months', parseInt(value))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('reseller.endUsers.selectDuration')} />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((months) => (
                        <SelectItem key={months} value={months.toString()}>
                          {t('reseller.endUsers.duration.months', { count: months })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {createForm.formState.errors.duration_months && (
                    <p className="text-sm text-destructive mt-1">
                      {createForm.formState.errors.duration_months.message}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="max_devices">{t('reseller.endUsers.deviceLimit')}</Label>
                  <Select
                    value={createForm.watch('max_devices')}
                    onValueChange={(value) => createForm.setValue('max_devices', value as '3' | '5' | '6' | '7' | '8' | '9' | '10')}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('reseller.endUsers.selectDeviceLimit')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3">{t('reseller.endUsers.deviceOptions.3')}</SelectItem>
                      <SelectItem value="5">{t('reseller.endUsers.deviceOptions.5')}</SelectItem>
                      <SelectItem value="6">{t('reseller.endUsers.deviceOptions.6')}</SelectItem>
                      <SelectItem value="7">{t('reseller.endUsers.deviceOptions.7')}</SelectItem>
                      <SelectItem value="8">{t('reseller.endUsers.deviceOptions.8')}</SelectItem>
                      <SelectItem value="9">{t('reseller.endUsers.deviceOptions.9')}</SelectItem>
                      <SelectItem value="10">{t('reseller.endUsers.deviceOptions.10')}</SelectItem>
                    </SelectContent>
                  </Select>
                  {createForm.formState.errors.max_devices && (
                    <p className="text-sm text-destructive mt-1">
                      {createForm.formState.errors.max_devices.message}
                    </p>
                  )}
                </div>

                <div>
                  <Label>{t('reseller.endUsers.contentCategories')}</Label>
                  <div className="space-y-3 mt-2">
                    {categoriesLoading ? (
                      <p className="text-sm text-muted-foreground">{t('tvCategories.loading')}</p>
                    ) : categories && categories.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {categories.map((category) => {
                          const isSelected = createForm.watch('category_ids').includes(category.id);
                          return (
                            <Button
                              key={category.id}
                              type="button"
                              variant={isSelected ? "default" : "outline"}
                              size="sm"
                              className={`transition-all duration-200 ${
                                isSelected
                                  ? 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-md'
                                  : 'hover:bg-muted hover:border-border'
                              }`}
                              onClick={() => {
                                const currentIds = createForm.watch('category_ids');
                                if (isSelected) {
                                  createForm.setValue('category_ids', currentIds.filter(id => id !== category.id));
                                } else {
                                  createForm.setValue('category_ids', [...currentIds, category.id]);
                                }
                              }}
                            >
                              <span className="flex items-center gap-2">
                                {getDisplayCategoryName(category.name)}
                                {isSelected && (
                                  <CheckCircle className="h-3 w-3" />
                                )}
                              </span>
                            </Button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">{t('demo.noCategories')}</p>
                    )}
                  </div>
                  {createForm.formState.errors.category_ids && (
                    <p className="text-sm text-destructive mt-1">
                      {createForm.formState.errors.category_ids.message}
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('reseller.endUsers.categoriesHelp')}
                  </p>
                </div>

                {/* Credit Calculation Display */}
                <Alert className={hasEnoughCredits ? 'border-green-500/20 bg-green-500/10' : 'border-destructive/20 bg-destructive/10'}>
                  <Calculator className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-2">
                      <div className="font-medium">{t('reseller.endUsers.creditCostCalculation')}</div>
                      <div className="text-sm">{creditCost.breakdown}</div>
                      <div className="font-bold text-lg">
                        {t('common.total')}: {creditCost.cost} {t('billing.offline.labels.credits')}
                      </div>
                      <div className="text-sm">
                        {t('reseller.endUsers.availableCredits')}: {creditBalance?.credits || 0}
                      </div>
                      {!hasEnoughCredits && creditCost.cost > 0 && (
                        <div className="text-destructive font-medium">
                          ⚠️ {t('reseller.endUsers.insufficientCredits')} {t('reseller.endUsers.needMoreCredits', { amount: creditCost.cost - (creditBalance?.credits || 0) })}
                        </div>
                      )}
                    </div>
                  </AlertDescription>
                </Alert>

                {createEndUserMutation.error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      {createEndUserMutation.error.message}
                    </AlertDescription>
                  </Alert>
                )}

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsCreateDialogOpen(false)}
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button
                    type="submit"
                    disabled={createEndUserMutation.isPending || !hasEnoughCredits || creditCost.cost === 0}
                  >
                    {createEndUserMutation.isPending
                      ? t('createContent.creating')
                      : !hasEnoughCredits
                        ? t('reseller.endUsers.insufficientCreditsShort')
                        : creditCost.cost === 0
                          ? t('reseller.endUsers.selectOptions')
                          : `${t('uiBulk.createEndUser')} (${creditCost.cost} ${t('billing.offline.labels.credits')})`}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {endUsers && endUsers.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('common.username')}</TableHead>
                <TableHead>{t('common.email')}</TableHead>
                <TableHead>{t('common.type')}</TableHead>
                <TableHead>{t('device.devices')}</TableHead>
                <TableHead>{t('common.status')}</TableHead>
                <TableHead>{t('admin.content.table.columns.created')}</TableHead>
                <TableHead>{t('reseller.endUsers.endLicense')}</TableHead>
                <TableHead>{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
              <TableBody>
              {endUsers.map((user) => {
                const demoTimeRemaining = user.is_demo ? getDemoTimeRemaining(user.demo_expires_at, t) : null;
                const isDemo = user.is_demo;
                const isDemoExpired = demoTimeRemaining?.expired;

                return (
                  <TableRow
                    key={user.id}
                    className={isDemo ? (isDemoExpired ? 'bg-destructive/5 border-destructive/20' : 'bg-orange-500/5 border-orange-500/20') : ''}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {user.username}
                        {isDemo && (
                          <Badge
                            variant={isDemoExpired ? 'destructive' : 'secondary'}
                            className={`text-xs ${isDemoExpired ? 'bg-destructive/10 text-destructive' : 'bg-orange-500/10 text-orange-600'}`}
                          >
                            <Clock className="h-3 w-3 mr-1" />
                            {t('reseller.endUsers.badges.demo')}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      {isDemo ? (
                        <div className="space-y-1">
                          <Badge
                            variant={isDemoExpired ? 'destructive' : 'secondary'}
                            className={`flex items-center gap-1 w-fit text-xs ${
                              isDemoExpired ? 'bg-destructive/10 text-destructive' : 'bg-orange-500/10 text-orange-600'
                            }`}
                          >
                            <Timer className="h-3 w-3" />
                            {isDemoExpired ? t('reseller.endUsers.expired') : `${demoTimeRemaining?.text} ${t('reseller.endUsers.left')}`}
                          </Badge>
                        </div>
                      ) : (
                        <Badge variant="default" className="flex items-center gap-1 w-fit bg-green-500/10 text-green-600">
                          <Users className="h-3 w-3" />
                          {t('reseller.endUsers.premium')}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="flex items-center gap-1 w-fit">
                        <Smartphone className="h-3 w-3" />
                        {user.max_devices || 3}
                      </Badge>
                    </TableCell>
                  <TableCell>
                    <Badge variant={user.active ? 'default' : 'destructive'}>
                      {user.active ? (
                        <>
                          <CheckCircle className="h-3 w-3 mr-1" />
                          {t('common.active')}
                        </>
                      ) : (
                        <>
                          <XCircle className="h-3 w-3 mr-1" />
                          {t('reseller.endUsers.suspended')}
                        </>
                      )}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {new Date(user.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const licenseStatus = getLicenseExpirationStatus(user.expires_at, t);

                      if (isDemo) {
                        return (
                          <Badge variant="secondary" className="flex items-center gap-1 w-fit bg-orange-500/10 text-orange-600">
                            <Clock className="h-3 w-3" />
                            {t('reseller.endUsers.demo')}
                          </Badge>
                        );
                      }

                      if (licenseStatus.status === 'never') {
                        return (
                          <Badge variant="default" className="flex items-center gap-1 w-fit bg-blue-500/10 text-blue-600">
                            <Clock className="h-3 w-3" />
                            {t('reseller.endUsers.never')}
                          </Badge>
                        );
                      }

                      if (licenseStatus.status === 'expired') {
                        return (
                          <Badge variant="destructive" className="flex items-center gap-1 w-fit bg-destructive/10 text-destructive">
                            <Clock className="h-3 w-3" />
                            {t('reseller.endUsers.expired')}
                          </Badge>
                        );
                      }

                      if (licenseStatus.status === 'critical') {
                        return (
                          <Badge variant="destructive" className="flex items-center gap-1 w-fit bg-destructive/10 text-destructive">
                            <Clock className="h-3 w-3" />
                            {licenseStatus.text}
                          </Badge>
                        );
                      }

                      if (licenseStatus.status === 'warning') {
                        return (
                          <Badge variant="secondary" className="flex items-center gap-1 w-fit bg-yellow-500/10 text-yellow-600">
                            <Clock className="h-3 w-3" />
                            {licenseStatus.text}
                          </Badge>
                        );
                      }

                      return (
                        <Badge variant="default" className="flex items-center gap-1 w-fit bg-green-500/10 text-green-600">
                          <Clock className="h-3 w-3" />
                          {licenseStatus.text}
                        </Badge>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditDialog(user)}
                      >
                        <Edit className="h-3 w-3 mr-1" />
                        {t('common.edit')}
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant={user.active ? 'destructive' : 'default'}
                            size="sm"
                          >
                            <Ban className="h-3 w-3 mr-1" />
                            {user.active ? t('common.disable') : t('common.enable')}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              {user.active
                                ? t('reseller.dialogs.suspend.title')
                                : t('reseller.dialogs.activate.title')}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              {user.active
                                ? t('reseller.dialogs.suspend.description', { username: user.username })
                                : t('reseller.dialogs.activate.description', { username: user.username })}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleToggleUserStatus(user)}
                              className={user.active ? 'bg-destructive hover:bg-destructive/90' : ''}
                            >
                              {`${user.active ? t('common.disable') : t('common.enable')} ${t('admin.loginHistory.table.user')}`}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="destructive"
                            size="sm"
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            {t('common.delete')}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t('reseller.dialogs.delete.title')}</AlertDialogTitle>
                            <AlertDialogDescription>
                              {t('reseller.dialogs.delete.description', { username: user.username })}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteUserMutation.mutate(user.id)}
                              className="bg-destructive hover:bg-destructive/90"
                            >
                              {`${t('common.delete')} ${t('admin.loginHistory.table.user')}`}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-8">
            <Users className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">{t('uiBulk.noEndUsersYet')}</h3>
            <p className="text-muted-foreground mb-4">{t('uiBulk.getStartedCreateFirstEndUser')}</p>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              {t('uiBulk.createEndUser')}
            </Button>
          </div>
        )}

        {/* Edit User Dialog */}
        <EditUserDialog
          user={selectedUser}
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
        />
      </CardContent>
    </Card>
  );
}
