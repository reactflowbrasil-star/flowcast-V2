'use client';

import React, { useState, useCallback, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import useLoadNamespace from '@/hooks/useLoadNamespace';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { EmptyState } from '@/components/ui/empty-state';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Edit, Ban, Trash2, Smartphone, Users, AlertCircle, CheckCircle, XCircle, Search, Filter, Clock, Timer } from 'lucide-react';
import { userService } from '@/services';
import { User, UserRole } from '@/types';
import EditUserDialog from './EditUserDialog';
import { useCategoriesAdmin } from '@/hooks/useCategories';
import { getDisplayCategoryName } from '@/lib/categoryUtils';
import { useUsernameValidation } from '@/hooks/useUsernameValidation';
import { UsernameInputWithValidation } from '@/components/ui/username-validator';
import { extractErrorMessage } from '@/lib/error-message';
import { AdminSectionHeader } from './AdminSectionHeader';

type CreateEndUserData = {
  username: string;
  password: string;
  email: string;
  max_devices: number;
  reseller_id?: number;
  expires_at?: string;
  category_ids: number[];
};

// Helper function to calculate demo time remaining (render-time formatting is localized)
const getDemoTimeRemaining = (demoExpiresAt?: string) => {
  if (!demoExpiresAt) return null;

  const now = new Date();
  const expiresAt = new Date(demoExpiresAt);
  const diffMs = expiresAt.getTime() - now.getTime();

  if (diffMs <= 0) return { expired: true, hours: 0, minutes: 0 };

  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;

  return { expired: false, hours, minutes };
};

// Helper function to calculate license expiration status (render-time formatting is localized)
const getLicenseExpirationStatus = (expiresAt?: string) => {
  if (!expiresAt) return { status: 'never' as const, daysRemaining: null as number | null, dateText: null as string | null };

  const now = new Date();
  const expirationDate = new Date(expiresAt);
  const diffMs = expirationDate.getTime() - now.getTime();
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (daysRemaining <= 0) {
    return { status: 'expired' as const, daysRemaining: 0, dateText: null };
  } else if (daysRemaining <= 7) {
    return { status: 'critical' as const, daysRemaining, dateText: null };
  } else if (daysRemaining <= 30) {
    return { status: 'warning' as const, daysRemaining, dateText: null };
  } else {
    return { status: 'good' as const, daysRemaining, dateText: expirationDate.toLocaleDateString() };
  }
};

interface AdminEndUserManagementProps {
  className?: string;
}

export default function AdminEndUserManagement({ className }: AdminEndUserManagementProps) {
  useLoadNamespace('admin/endUserManagement');
  const { t } = useTranslation(['admin/endUserManagement', 'admin', 'translation']);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [usernameFilter, setUsernameFilter] = useState('');
  const [emailFilter, setEmailFilter] = useState('');
  const [resellerFilter, setResellerFilter] = useState('');
  const queryClient = useQueryClient();

  // Fetch all end users
  const { data: endUsers, isLoading, error } = useQuery({
    queryKey: ['admin-end-users'],
    queryFn: async () => {
      const result = await userService.getUsers({ role: UserRole.END_USER });
      if (result.success) {
        return result.data;
      }
      throw new Error(extractErrorMessage(result.error, t('endUserManagement.errors.loadEndUsersFailed')));
    }
  });

  // Fetch resellers for assignment
  const { data: resellers } = useQuery({
    queryKey: ['resellers'],
    queryFn: async () => {
      const result = await userService.getUsers({ role: UserRole.RESELLER });
      if (result.success) {
        return result.data;
      }
      throw new Error(extractErrorMessage(result.error, t('endUserManagement.errors.loadResellersFailed')));
    }
  });

  // Fetch available categories
  const { data: categories, isLoading: categoriesLoading } = useCategoriesAdmin();

  const createEndUserSchema = useMemo(() => z.object({
    username: z.string().min(3, t('endUserManagement.validation.usernameMin', { count: 3 })),
    password: z.string()
      .min(4, t('endUserManagement.validation.passwordMinDigits', { count: 4 }))
      .max(10, t('endUserManagement.validation.passwordMaxDigits', { count: 10 }))
      .regex(/^\d+$/, t('endUserManagement.validation.passwordDigitsOnly')),
    email: z.string().email(t('endUserManagement.validation.emailInvalid')),
    max_devices: z.number()
      .min(1, t('endUserManagement.validation.maxDevicesMin', { count: 1 }))
      .max(10, t('endUserManagement.validation.maxDevicesMax', { count: 10 })),
    reseller_id: z.number().optional(),
    expires_at: z.string().optional(),
    category_ids: z.array(z.number()).min(1, t('endUserManagement.validation.categoryMin', { count: 1 }))
  }), [t]);

  // Create end user form
  const createForm = useForm<CreateEndUserData>({
    resolver: zodResolver(createEndUserSchema),
    defaultValues: {
      username: '',
      password: '',
      email: '',
      max_devices: 3,
      reseller_id: undefined,
      expires_at: '',
      category_ids: []
    }
  });

  // Username validation
  const watchedUsername = createForm.watch('username');
  const usernameValidation = useUsernameValidation(watchedUsername);

  // Create end user mutation
  const createEndUserMutation = useMutation({
    mutationFn: async (data: CreateEndUserData) => {
      const result = await userService.createUser({
        ...data,
        role: UserRole.END_USER
      });
      if (result.success) {
        return result.data;
      }
      throw new Error(extractErrorMessage(result.error, t('endUserManagement.errors.createFailed')));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-end-users'] });
      setIsCreateDialogOpen(false);
      createForm.reset();
    }
  });

  // Toggle user status mutation
  const toggleUserStatusMutation = useMutation({
    mutationFn: async ({ userId, active }: { userId: number; active: boolean }) => {
      const result = await userService.toggleUserStatus(userId, active);
      if (result.success) {
        return result.data;
      }
      throw new Error(extractErrorMessage(result.error, t('endUserManagement.errors.updateStatusFailed')));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-end-users'] });
    }
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      const result = await userService.deleteUser(userId);
      if (result.success) {
        return result.data;
      }
      throw new Error(extractErrorMessage(result.error, t('endUserManagement.errors.deleteFailed')));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-end-users'] });
    }
  });

  const handleCreateEndUser = (data: CreateEndUserData) => {
    // Convert datetime-local format to ISO 8601 with timezone
    const processedData = {
      ...data,
      expires_at: data.expires_at ? new Date(data.expires_at).toISOString() : undefined
    };
    createEndUserMutation.mutate(processedData);
  };

  const handleToggleUserStatus = (user: User) => {
    toggleUserStatusMutation.mutate({
      userId: user.id,
      active: !user.active
    });
  };

  const handleDeleteUser = (userId: number) => {
    deleteUserMutation.mutate(userId);
  };

  const getResellerName = useCallback((resellerId?: number) => {
    if (!resellerId || !resellers) return t('endUserManagement.directAdminManagement');
    const reseller = resellers.find(r => r.id === resellerId);
    return reseller ? reseller.username : t('common.none');
  }, [resellers, t]);

  // Filter users based on search criteria
  const filteredUsers = React.useMemo(() => {
    if (!endUsers) return [];

    return endUsers.filter(user => {
      const matchesUsername = !usernameFilter ||
        user.username.toLowerCase().includes(usernameFilter.toLowerCase());

      const matchesEmail = !emailFilter ||
        (user.email && user.email.toLowerCase().includes(emailFilter.toLowerCase()));

      const resellerName = getResellerName(user.created_by || undefined);
      const matchesReseller = !resellerFilter ||
        resellerName.toLowerCase().includes(resellerFilter.toLowerCase());

      return matchesUsername && matchesEmail && matchesReseller;
    });
  }, [endUsers, usernameFilter, emailFilter, resellerFilter, resellers, getResellerName]);

  const headerDescription = (
    <>
      <div>{t('endUserManagement.subtitle')}</div>
      <div className="mt-3 flex items-center gap-4 text-xs text-gray-600 dark:text-gray-400">
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded border border-orange-200 bg-orange-100 dark:border-orange-700 dark:bg-orange-900/50"></div>
          <span>{t('endUserManagement.demoUser')}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded border border-red-200 bg-red-100 dark:border-red-700 dark:bg-red-900/50"></div>
          <span>{t('endUserManagement.expiredDemo')}</span>
        </div>
        <div className="flex items-center gap-1">
          <Badge variant="secondary" className="bg-orange-100 text-xs text-orange-800 dark:bg-orange-900/50 dark:text-orange-300">
            <Clock className="mr-1 h-2 w-2" />
            {t('endUserManagement.demoBadge')}
          </Badge>
          <span>{t('endUserManagement.demoBadge')}</span>
        </div>
      </div>
    </>
  );

  const renderHeader = (actions?: ReactNode, includeLegend = false) => (
    <AdminSectionHeader
      icon={Users}
      title={t('endUserManagement.title')}
      description={includeLegend ? headerDescription : t('endUserManagement.subtitle')}
      actions={actions}
    />
  );

  if (isLoading) {
    return (
      <div className={`space-y-6 max-w-[1400px] mx-auto w-full ${className || ''}`}>
        {renderHeader()}
        <Card>
          <CardContent>
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`space-y-6 max-w-[1400px] mx-auto w-full ${className || ''}`}>
        {renderHeader()}
        <Card>
          <CardContent>
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {t('endUserManagement.errors.loadEndUsersFailedWithMessage', { message: error.message })}
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={`space-y-6 max-w-[1400px] mx-auto w-full ${className || ''}`}>
      {renderHeader(
        <div className="flex flex-wrap items-center gap-2">
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                {t('endUserManagement.createEndUser')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('endUserManagement.createEndUser')}</DialogTitle>
                <DialogDescription>
                  {t('endUserManagement.subtitle')}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={createForm.handleSubmit(handleCreateEndUser)} className="space-y-4">
                <div>
                  <Label htmlFor="username">{t('endUserManagement.form.username')}</Label>
                  <UsernameInputWithValidation
                    value={watchedUsername}
                    onChange={(value) => createForm.setValue('username', value)}
                    validation={usernameValidation}
                    placeholder={t('placeholders.enterUsername')}
                  />
                  {createForm.formState.errors.username && (
                    <p className="text-sm text-red-500 mt-1">
                      {createForm.formState.errors.username.message}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="password">{t('endUserManagement.form.password')}</Label>
                  <Input
                    id="password"
                    type="password"
                    {...createForm.register('password')}
                    placeholder={t('placeholders.currentPassword')}
                  />
                  {createForm.formState.errors.password && (
                    <p className="text-sm text-red-500 mt-1">
                      {createForm.formState.errors.password.message}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="email">{t('endUserManagement.form.email')}</Label>
                  <Input
                    id="email"
                    type="email"
                    {...createForm.register('email')}
                    placeholder={t('placeholders.userEmail')}
                  />
                  {createForm.formState.errors.email && (
                    <p className="text-sm text-red-500 mt-1">
                      {createForm.formState.errors.email.message}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="max_devices">{t('endUserManagement.form.maxDevices')}</Label>
                  <Input
                    id="max_devices"
                    type="number"
                    min="1"
                    max="10"
                    {...createForm.register('max_devices', { valueAsNumber: true })}
                    placeholder={t('placeholders.maximumDevices')}
                  />
                  {createForm.formState.errors.max_devices && (
                    <p className="text-sm text-red-500 mt-1">
                      {createForm.formState.errors.max_devices.message}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="expires_at">{t('endUserManagement.form.expiryDate')}</Label>
                  <Input
                    id="expires_at"
                    type="datetime-local"
                    {...createForm.register('expires_at')}
                    placeholder={t('placeholders.expiryDateTime')}
                  />
                  {createForm.formState.errors.expires_at && (
                    <p className="text-sm text-red-500 mt-1">
                      {createForm.formState.errors.expires_at.message}
                    </p>
                  )}
                  <p className="text-sm text-gray-500 mt-1">
                    {t('endUserManagement.form.expiryDateHelp')}
                  </p>
                </div>

                <div>
                  <Label htmlFor="reseller_id">{t('endUserManagement.form.assignReseller')}</Label>
                  <Select
                    onValueChange={(value) =>
                      createForm.setValue('reseller_id', value === 'none' ? undefined : parseInt(value))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('placeholders.selectReseller')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('endUserManagement.directAdminManagement')}</SelectItem>
                      {resellers?.map((reseller) => (
                        <SelectItem key={reseller.id} value={reseller.id.toString()}>
                          {reseller.username} ({reseller.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>{t('endUserManagement.form.selectContentCategories')}</Label>
                  <div className="space-y-3 mt-2">
                    {categoriesLoading ? (
                      <p className="text-sm text-gray-500">{t('endUserManagement.form.loadingCategories')}</p>
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
                              onClick={() => {
                                const currentIds = createForm.getValues('category_ids');
                                if (isSelected) {
                                  createForm.setValue(
                                    'category_ids',
                                    currentIds.filter(id => id !== category.id)
                                  );
                                } else {
                                  createForm.setValue('category_ids', [...currentIds, category.id]);
                                }
                              }}
                            >
                              {getDisplayCategoryName(category.name)}
                            </Button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">{t('endUserManagement.form.noCategories')}</p>
                    )}
                  </div>
                  {createForm.formState.errors.category_ids && (
                    <p className="text-sm text-red-600 mt-1">
                      {createForm.formState.errors.category_ids.message}
                    </p>
                  )}
                  <p className="text-sm text-gray-500 mt-1">
                    {t('endUserManagement.form.selectCategoriesHelp')}
                  </p>
                </div>

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
                    disabled={createEndUserMutation.isPending}
                  >
                    {createEndUserMutation.isPending ? t('createContent.creating') : t('uiBulk.createEndUser')}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>,
        true
      )}

      {/* Main Content */}
      <Card>
        <CardContent className="pt-6">
          {/* Filters */}
          <div className="mb-6 space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <Filter className="h-4 w-4" />
              <span className="text-sm font-medium">{t('endUserManagement.filters.title')}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="username-filter">{t('endUserManagement.filters.username')}</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="username-filter"
                    placeholder={t('uiBulk.searchByUsername')}
                    value={usernameFilter}
                    onChange={(e) => setUsernameFilter(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="email-filter">{t('endUserManagement.filters.email')}</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email-filter"
                    placeholder={t('uiBulk.searchByEmail')}
                    value={emailFilter}
                    onChange={(e) => setEmailFilter(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="reseller-filter">{t('endUserManagement.filters.reseller')}</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="reseller-filter"
                    placeholder={t('uiBulk.searchByReseller')}
                    value={resellerFilter}
                    onChange={(e) => setResellerFilter(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
            </div>
            {(usernameFilter || emailFilter || resellerFilter) && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {t('endUserManagement.filters.showing', { count: filteredUsers.length, total: endUsers?.length || 0 })}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setUsernameFilter('');
                    setEmailFilter('');
                    setResellerFilter('');
                  }}
                >
                  {t('endUserManagement.filters.clear')}
                </Button>
              </div>
            )}
          </div>

          {endUsers && endUsers.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('endUserManagement.table.username')}</TableHead>
                  <TableHead>{t('endUserManagement.table.email')}</TableHead>
                  <TableHead>{t('endUserManagement.table.type')}</TableHead>
                  <TableHead>{t('endUserManagement.table.maxDevices')}</TableHead>
                  <TableHead>{t('endUserManagement.table.reseller')}</TableHead>
                  <TableHead>{t('endUserManagement.table.status')}</TableHead>
                  <TableHead>{t('endUserManagement.table.created')}</TableHead>
                  <TableHead>{t('endUserManagement.table.endLicense')}</TableHead>
                  <TableHead>{t('endUserManagement.table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10}>
                      <div className="py-10">
                        <EmptyState title={t('uiBulk.noMatches')} description={t('uiBulk.tryAdjustingFilters')} />
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {filteredUsers.map((user) => {
                      const demoTimeRemaining = user.is_demo ? getDemoTimeRemaining(user.demo_expires_at) : null;
                      const isDemo = user.is_demo;
                      const isDemoExpired = demoTimeRemaining?.expired;

                      return (
                        <TableRow
                          key={user.id}
                          className={isDemo ? (isDemoExpired ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' : 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800') : ''}
                        >
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {user.username}
                              {isDemo && (
                                <Badge
                                  variant={isDemoExpired ? 'destructive' : 'secondary'}
                                  className={`text-xs ${isDemoExpired ? 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300' : 'bg-orange-100 dark:bg-orange-900/50 text-orange-800 dark:text-orange-300'}`}
                                >
                                  <Clock className="h-3 w-3 mr-1" />
                                  {t('endUserManagement.demoBadge')}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="truncate max-w-[200px] block" title={user.email || t('common.notAvailable')}>
                              {user.email || t('common.notAvailable')}
                            </span>
                          </TableCell>
                          <TableCell>
                            {isDemo ? (
                              <div className="space-y-1">
                                <Badge
                                  variant={isDemoExpired ? 'destructive' : 'secondary'}
                                  className={`flex items-center gap-1 w-fit text-xs ${isDemoExpired ? 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300' : 'bg-orange-100 dark:bg-orange-900/50 text-orange-800 dark:text-orange-300'
                                    }`}
                                >
                                  <Timer className="h-3 w-3" />
                                  {isDemoExpired
                                    ? t('endUserManagement.expired')
                                    : `${demoTimeRemaining?.hours && demoTimeRemaining.hours > 0
                                      ? t('endUserManagement.time.hoursMinutes', { hours: demoTimeRemaining.hours, minutes: demoTimeRemaining.minutes })
                                      : t('endUserManagement.time.minutes', { minutes: demoTimeRemaining?.minutes ?? 0 })
                                    } ${t('endUserManagement.timeLeft')}`}
                                </Badge>
                              </div>
                            ) : (
                              <Badge variant="default" className="flex items-center gap-1 w-fit bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300">
                                <Users className="h-3 w-3" />
                                {t('endUserManagement.table.premium')}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Smartphone className="h-3 w-3" />
                              {user.max_devices}
                            </div>
                          </TableCell>
                          <TableCell>{getResellerName(user.created_by || undefined)}</TableCell>
                          <TableCell>
                            <Badge variant={user.active ? 'default' : 'destructive'}>
                              {user.active ? (
                                <>
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  {t('endUserManagement.status.active')}
                                </>
                              ) : (
                                <>
                                  <XCircle className="h-3 w-3 mr-1" />
                                  {t('endUserManagement.status.banned')}
                                </>
                              )}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {new Date(user.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            {(() => {
                              const licenseStatus = getLicenseExpirationStatus(user.expires_at);

                              if (isDemo) {
                                return (
                                  <Badge variant="secondary" className="flex items-center gap-1 w-fit bg-orange-100 dark:bg-orange-900/50 text-orange-800 dark:text-orange-300">
                                    <Clock className="h-3 w-3" />
                                    {t('endUserManagement.demoBadge')}
                                  </Badge>
                                );
                              }

                              if (licenseStatus.status === 'never') {
                                return (
                                  <Badge variant="default" className="flex items-center gap-1 w-fit bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300">
                                    <Clock className="h-3 w-3" />
                                    {t('endUserManagement.neverLabel')}
                                  </Badge>
                                );
                              }

                              if (licenseStatus.status === 'expired') {
                                return (
                                  <Badge variant="destructive" className="flex items-center gap-1 w-fit">
                                    <Clock className="h-3 w-3" />
                                    {t('endUserManagement.expired')}
                                  </Badge>
                                );
                              }

                              if (licenseStatus.status === 'critical') {
                                return (
                                  <Badge variant="destructive" className="flex items-center gap-1 w-fit bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300">
                                    <Clock className="h-3 w-3" />
                                    {t('endUserManagement.daysRemaining', { count: licenseStatus.daysRemaining ?? 0 })}
                                  </Badge>
                                );
                              }

                              if (licenseStatus.status === 'warning') {
                                return (
                                  <Badge variant="secondary" className="flex items-center gap-1 w-fit bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-300">
                                    <Clock className="h-3 w-3" />
                                    {t('endUserManagement.daysRemaining', { count: licenseStatus.daysRemaining ?? 0 })}
                                  </Badge>
                                );
                              }

                              return (
                                <Badge variant="default" className="flex items-center gap-1 w-fit bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300">
                                  <Clock className="h-3 w-3" />
                                  {licenseStatus.dateText ?? ''}
                                </Badge>
                              );
                            })()}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedUser(user);
                                  setIsEditDialogOpen(true);
                                }}
                              >
                                <Edit className="h-3 w-3 mr-1" />
                                {t('endUserManagement.actions.edit')}
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant={user.active ? 'destructive' : 'default'}
                                    size="sm"
                                  >
                                    <Ban className="h-3 w-3 mr-1" />
                                    {user.active ? t('endUserManagement.actions.ban') : t('endUserManagement.actions.unban')}
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>
                                      {user.active ? t('endUserManagement.actions.banUser') : t('endUserManagement.actions.unbanUser')}
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                      {t('endUserManagement.actions.confirmBan', {
                                        action: user.active ? t('endUserManagement.actions.ban').toLowerCase() : t('endUserManagement.actions.unban').toLowerCase(),
                                        username: user.username
                                      })}
                                      {user.active && ` ${t('endUserManagement.actions.banWarning')}`}
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleToggleUserStatus(user)}
                                      className={user.active ? 'bg-red-600 hover:bg-red-700' : ''}
                                    >
                                      {user.active ? t('endUserManagement.actions.banUser') : t('endUserManagement.actions.unbanUser')}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>

                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>{t('endUserManagement.actions.deleteUser')}</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      {t('endUserManagement.actions.confirmDelete', { username: user.username })}
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleDeleteUser(user.id)}
                                      className="bg-red-600 hover:bg-red-700"
                                    >
                                      {t('endUserManagement.actions.deleteUser')}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </>
                )}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8">
              <EmptyState
                title={t('uiBulk.noEndUsersYet')}
                description={t('uiBulk.getStartedCreateFirstEndUser')}
                actionLabel={`${t('common.create')} ${t('common.endUsers')}`}
                onAction={() => setIsCreateDialogOpen(true)}
                icon={<Users className="h-12 w-12" />}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit User Dialog */}
      <EditUserDialog
        user={selectedUser}
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
      />
    </div>
  );
}
