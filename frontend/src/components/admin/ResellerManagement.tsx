'use client';

import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import useLoadNamespace from '@/hooks/useLoadNamespace';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Plus, Edit, Ban, DollarSign, Users, AlertCircle, CheckCircle, XCircle, Trash2, Clock, Eye, Key, Settings, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { userService } from '@/services';
import { User, UserRole } from '@/types';
import UpdateDemoLimitDialog from './UpdateDemoLimitDialog';
import ViewResellerUsersDialog from './ViewResellerUsersDialog';
import { useConfirmation } from '@/components/ui/confirmation-dialog';
import { extractErrorMessage } from '@/lib/error-message';
import i18n from '@/lib/i18n';
import { AdminSectionHeader } from './AdminSectionHeader';

// Validation schemas
const createResellerSchema = z.object({
  username: z.string().min(3, i18n.t('reseller.endUsers.validation.usernameMin')),
  password: z
    .string()
    .min(4, i18n.t('reseller.endUsers.validation.passwordMin'))
    .max(10, i18n.t('reseller.endUsers.validation.passwordMax'))
    .regex(/^\d+$/, i18n.t('reseller.endUsers.validation.passwordDigits')),
  email: z.string().email(i18n.t('reseller.endUsers.validation.invalidEmail')),
  credits: z.number().min(0, i18n.t('admin.billing.offline.errors.creditsPositive')),
  daily_demo_limit: z.number().min(0, i18n.t('common.serverError')).max(50, i18n.t('common.serverError'))
});

const editCreditsSchema = z.object({
  credits: z.number().min(0, i18n.t('admin.billing.offline.errors.creditsPositive'))
});

const editResellerSchema = z.object({
  username: z.string().min(3, i18n.t('reseller.endUsers.validation.usernameMin')).optional(),
  email: z.string().email(i18n.t('reseller.endUsers.validation.invalidEmail')).optional(),
  active: z.boolean().optional()
});

type CreateResellerData = z.infer<typeof createResellerSchema>;
type EditCreditsData = z.infer<typeof editCreditsSchema>;
type EditResellerData = z.infer<typeof editResellerSchema>;

interface ResellerManagementProps {
  className?: string;
}

export default function ResellerManagement({ className }: ResellerManagementProps) {
  useLoadNamespace('admin/resellerManagement');
  const { t, i18n } = useTranslation(['admin/resellerManagement', 'admin', 'translation']);
  const [selectedReseller, setSelectedReseller] = useState<User | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditCreditsDialogOpen, setIsEditCreditsDialogOpen] = useState(false);
  const [isResetPasswordDialogOpen, setIsResetPasswordDialogOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [passwordResetSuccess, setPasswordResetSuccess] = useState<boolean | null>(null);
  const [isDemoLimitDialogOpen, setIsDemoLimitDialogOpen] = useState(false);
  const [isViewUsersDialogOpen, setIsViewUsersDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 24;
  const queryClient = useQueryClient();
  const { confirm: confirmAction, ConfirmationDialog } = useConfirmation();

  // Fetch resellers
  const { data: resellers, isLoading, error } = useQuery({
    queryKey: ['resellers'],
    queryFn: async () => {
      const result = await userService.getUsers({ role: UserRole.RESELLER });
      if (result.success) {
        return result.data;
      }
      throw new Error(extractErrorMessage(result.error, t('common.serverError')));
    }
  });

  // Create reseller form
  const createForm = useForm<CreateResellerData>({
    resolver: zodResolver(createResellerSchema),
    defaultValues: {
      username: '',
      password: '',
      email: '',
      credits: 0,
      daily_demo_limit: 5
    }
  });

  // Edit credits form
  const editCreditsForm = useForm<EditCreditsData>({
    resolver: zodResolver(editCreditsSchema),
    defaultValues: {
      credits: 0
    }
  });

  // Edit reseller form
  const editResellerForm = useForm<EditResellerData>({
    resolver: zodResolver(editResellerSchema),
    defaultValues: {
      username: '',
      email: '',
      active: true
    }
  });

  // Create reseller mutation
  const createResellerMutation = useMutation({
    mutationFn: async (data: CreateResellerData) => {
      const result = await userService.createUser({
        ...data,
        role: UserRole.RESELLER,
        max_devices: 0, // Resellers don't have device limits
      });
      if (result.success) {
        return result.data;
      }
      throw new Error(extractErrorMessage(result.error, t('common.serverError')));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resellers'] });
      setIsCreateDialogOpen(false);
      createForm.reset();
    }
  });

  // Update credits mutation
  const updateCreditsMutation = useMutation({
    mutationFn: async ({ userId, credits }: { userId: number; credits: number }) => {
      const result = await userService.updateUserCredits(userId, credits);
      if (result.success) {
        return result.data;
      }
      throw new Error(extractErrorMessage(result.error, t('common.serverError')));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resellers'] });
      setIsEditCreditsDialogOpen(false);
      setSelectedReseller(null);
      editCreditsForm.reset();
    }
  });

  // Update reseller mutation
  const updateResellerMutation = useMutation({
    mutationFn: async ({ resellerId, data }: { resellerId: number; data: EditResellerData }) => {
      const result = await userService.updateReseller(resellerId, data);
      if (result.success) {
        return result.data;
      }
      throw new Error(extractErrorMessage(result.error, t('common.serverError')));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resellers'] });
      // setIsEditResellerDialogOpen(false); // State removed - dialog not implemented
      setSelectedReseller(null);
      editResellerForm.reset();
    }
  });

  // Reset password mutation
  const resetPasswordMutation = useMutation({
    mutationFn: async ({ userId, newPassword }: { userId: number; newPassword: string }) => {
      const result = await userService.resetUserPassword(userId, newPassword);
      if (result.success) {
        return result.data;
      }
      throw new Error(extractErrorMessage(result.error, t('common.serverError')));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resellers'] });
      setPasswordResetSuccess(true);
    },
    onError: () => {
      setPasswordResetSuccess(false);
    }
  });

  // Ban/unban reseller mutation
  const toggleBanMutation = useMutation({
    mutationFn: async ({ userId, active }: { userId: number; active: boolean }) => {
      const result = await userService.updateUser(userId, { active });
      if (result.success) {
        return result.data;
      }
      throw new Error(extractErrorMessage(result.error, t('common.serverError')));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resellers'] });
    }
  });

  // Delete reseller mutation
  const deleteResellerMutation = useMutation({
    mutationFn: async (userId: number) => {
      const result = await userService.deleteUser(userId);
      if (result.success) {
        return result.data;
      }
      throw new Error(extractErrorMessage(result.error, t('common.serverError')));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resellers'] });
    }
  });

  const handleCreateReseller = (data: CreateResellerData) => {
    createResellerMutation.mutate(data);
  };

  const handleEditCredits = (data: EditCreditsData) => {
    if (selectedReseller) {
      updateCreditsMutation.mutate({
        userId: selectedReseller.id,
        credits: data.credits
      });
    }
  };

  const handleEditReseller = (data: EditResellerData) => {
    if (selectedReseller) {
      updateResellerMutation.mutate({
        resellerId: selectedReseller.id,
        data
      });
    }
  };

  // Generate secure password
  const generateSecurePassword = (): string => {
    const length = 8;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';

    // Ensure at least one lowercase, one uppercase, one number, and one special character
    password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]; // lowercase
    password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)]; // uppercase
    password += '0123456789'[Math.floor(Math.random() * 10)]; // number
    password += '!@#$%^&*'[Math.floor(Math.random() * 8)]; // special

    // Fill the rest randomly
    for (let i = 4; i < length; i++) {
      password += charset[Math.floor(Math.random() * charset.length)];
    }

    // Shuffle the password to randomize character positions
    return password.split('').sort(() => Math.random() - 0.5).join('');
  };


  const handleResetPassword = async () => {
    if (!selectedReseller) return;

    const generatedPassword = generateSecurePassword();
    setNewPassword(generatedPassword);
    setPasswordResetSuccess(null);

    // Small delay to ensure state is updated before mutation
    await new Promise(resolve => setTimeout(resolve, 100));

    resetPasswordMutation.mutate({
      userId: selectedReseller.id,
      newPassword: generatedPassword
    });
  };

  const openResetPasswordDialog = (reseller: User) => {
    setSelectedReseller(reseller);
    setNewPassword('');
    setPasswordResetSuccess(null);
    resetPasswordMutation.reset(); // Reset any previous mutation state
    setIsResetPasswordDialogOpen(true);
  };

  const closeResetPasswordDialog = () => {
    setIsResetPasswordDialogOpen(false);
    setNewPassword('');
    setPasswordResetSuccess(null);
    setSelectedReseller(null);
    resetPasswordMutation.reset();
  };

  const handleToggleBan = (reseller: User) => {
    toggleBanMutation.mutate({
      userId: reseller.id,
      active: !reseller.active
    });
  };

  const handleDeleteReseller = (reseller: User) => {
    confirmAction({
      title: t('reseller.confirmDelete', {}),
      description: t('reseller.confirmDeleteDescription', {
        username: reseller.username
      }),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      variant: 'danger',
      onConfirm: () => deleteResellerMutation.mutate(reseller.id)
    });
  };

  const openEditCreditsDialog = (reseller: User) => {
    setSelectedReseller(reseller);
    editCreditsForm.setValue('credits', reseller.credits || 0);
    setIsEditCreditsDialogOpen(true);
  };

  const openEditResellerDialog = (reseller: User) => {
    setSelectedReseller(reseller);
    editResellerForm.setValue('username', reseller.username);
    editResellerForm.setValue('email', reseller.email || '');
    editResellerForm.setValue('active', reseller.active);
  };

  const openDemoLimitDialog = (reseller: User) => {
    setSelectedReseller(reseller);
    setIsDemoLimitDialogOpen(true);
  };

  const openViewUsersDialog = (reseller: User) => {
    setSelectedReseller(reseller);
    setIsViewUsersDialogOpen(true);
  };

  // Filter resellers based on search query
  const filteredResellers = resellers?.filter(reseller =>
    reseller.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    reseller.email?.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  // Pagination
  const totalPages = Math.ceil(filteredResellers.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedResellers = filteredResellers.slice(startIndex, endIndex);

  // Reset to page 1 when search changes
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

  const renderHeader = (actions?: ReactNode) => (
    <AdminSectionHeader
      icon={Users}
      title={t('uiBulk.resellerManagement.title')}
      description={t('uiBulk.resellerManagement.subtitle')}
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
              <AlertDescription>{t('reseller.failedToLoad', { message: error.message })}</AlertDescription>
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
          <Button
            variant="outline"
            onClick={() => {
              confirmAction({
                title: t('uiBulk.resetAllCounters', {}),
                description: t('uiBulk.resetAllCountersConfirm', {}),
                confirmText: t('common.confirm'),
                cancelText: t('common.cancel'),
                variant: 'warning',
                onConfirm: async () => {
                  const result = await userService.resetDailyDemoCounters();
                  if (result.success) {
                    toast.success(result.data.message);
                    queryClient.invalidateQueries({ queryKey: ['resellers'] });
                  } else {
                    toast.error(`Error: ${result.error.details}`);
                  }
                }
              });
            }}
          >
            <Clock className="h-4 w-4 mr-2" />
            {t('uiBulk.resetAllCounters')}
          </Button>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                {t('uiBulk.createReseller')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('uiBulk.createReseller')}</DialogTitle>
                <DialogDescription>
                  {t('uiBulk.createResellerDescription')}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={createForm.handleSubmit(handleCreateReseller)} className="space-y-4">
                <div>
                  <Label htmlFor="username">{t('common.username')}</Label>
                  <Input
                    id="username"
                    {...createForm.register('username')}
                    placeholder={t('uiBulk.reseller.form.usernamePlaceholder')}
                  />
                  {createForm.formState.errors.username && (
                    <p className="text-sm text-red-600 mt-1">
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
                    placeholder={t('uiBulk.reseller.form.passwordPlaceholder')}
                  />
                  {createForm.formState.errors.password && (
                    <p className="text-sm text-red-600 mt-1">
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
                    placeholder={t('uiBulk.reseller.form.emailPlaceholder')}
                  />
                  {createForm.formState.errors.email && (
                    <p className="text-sm text-red-600 mt-1">
                      {createForm.formState.errors.email.message}
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="credits">{t('uiBulk.creditsLabel')}</Label>
                  <Input
                    id="credits"
                    type="number"
                    min="0"
                    step="0.1"
                    {...createForm.register('credits', {
                      valueAsNumber: true,
                      setValueAs: (value) => value === '' ? undefined : Number(value)
                    })}
                    placeholder="0"
                  />
                  {createForm.formState.errors.credits && (
                    <p className="text-sm text-red-600 mt-1">
                      {createForm.formState.errors.credits.message}
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="daily_demo_limit">{t('uiBulk.dailyDemoLimit', {})}</Label>
                  <Input
                    id="daily_demo_limit"
                    type="number"
                    min="0"
                    max="50"
                    {...createForm.register('daily_demo_limit', {
                      valueAsNumber: true,
                      setValueAs: (value) => value === '' ? undefined : Number(value)
                    })}
                    placeholder="5"
                  />
                  {createForm.formState.errors.daily_demo_limit && (
                    <p className="text-sm text-red-600 mt-1">
                      {createForm.formState.errors.daily_demo_limit.message}
                    </p>
                  )}
                </div>
                {createResellerMutation.error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      {createResellerMutation.error.message}
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
                    disabled={createResellerMutation.isPending}
                  >
                    {createResellerMutation.isPending ? t('createContent.creating') : t('uiBulk.createReseller')}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {/* Main Content */}
      <Card>
        <CardContent className="pt-6">
          {/* Search Filter */}
          <div className="mb-4">
            <Input
              placeholder={t('uiBulk.searchByUsernameOrEmail')}
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="max-w-sm"
            />
          </div>

          {resellers && resellers.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.username')}</TableHead>
                  <TableHead>{t('common.email')}</TableHead>
                  <TableHead>{t('uiBulk.creditsLabel')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead>{t('common.date')}</TableHead>
                  <TableHead>{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredResellers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <div className="py-10">
                        <EmptyState
                          title={t('uiBulk.noMatches')}
                          description={t('uiBulk.tryAdjustingFilters')}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {paginatedResellers.map((reseller) => (
                      <TableRow key={reseller.id}>
                        <TableCell className="font-medium">
                          <span className="truncate max-w-[150px] block" title={reseller.username}>
                            {reseller.username}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="truncate max-w-[200px] block" title={reseller.email}>
                            {reseller.email}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="flex items-center gap-1 w-fit">
                            <DollarSign className="h-3 w-3" />
                            {reseller.credits || 0}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={reseller.active ? 'default' : 'destructive'}>
                            {reseller.active ? (
                              <>
                                <CheckCircle className="h-3 w-3 mr-1" />
                                {t('reseller.activeLabel')}
                              </>
                            ) : (
                              <>
                                <XCircle className="h-3 w-3 mr-1" />
                                {t('reseller.bannedLabel')}
                              </>
                            )}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {new Date(reseller.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {/* Tools Dropdown - Acciones comunes */}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm">
                                  <Settings className="h-3 w-3 mr-1" />
                                  {t('uiBulk.tools')}
                                  <ChevronDown className="h-3 w-3 ml-1" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem onClick={() => openViewUsersDialog(reseller)}>
                                  <Eye className="h-4 w-4 mr-2" />
                                  {t('uiBulk.viewUsers')}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openEditResellerDialog(reseller)}>
                                  <Edit className="h-4 w-4 mr-2" />
                                  {t('uiBulk.editReseller')}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openResetPasswordDialog(reseller)}>
                                  <Key className="h-4 w-4 mr-2" />
                                  {t('uiBulk.resetPassword')}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openEditCreditsDialog(reseller)}>
                                  <DollarSign className="h-4 w-4 mr-2" />
                                  {t('uiBulk.manageCredits')}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openDemoLimitDialog(reseller)}>
                                  <Clock className="h-4 w-4 mr-2" />
                                  {t('uiBulk.demoSettings')}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>

                            {/* Ban/Unban button - critical but visible action */}
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant={reseller.active ? 'destructive' : 'default'}
                                  size="sm"
                                >
                                  <Ban className="h-3 w-3 mr-1" />
                                  {reseller.active ? t('reseller.ban') : t('reseller.unban')}
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>
                                    {reseller.active ? t('reseller.banTitle') : t('reseller.unbanTitle')}
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {reseller.active ? t('reseller.banDescription', { username: reseller.username }) : t('reseller.unbanDescription', { username: reseller.username })}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleToggleBan(reseller)}
                                    className={reseller.active ? 'bg-red-600 hover:bg-red-700' : ''}
                                  >
                                    {reseller.active ? t('reseller.banAction') : t('reseller.unbanAction')}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>

                            {/* Delete button - most critical, always visible */}
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDeleteReseller(reseller)}
                              disabled={deleteResellerMutation.isPending}
                            >
                              <Trash2 className="h-3 w-3 mr-1" />
                              {t('common.delete')}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </>
                )}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8">
              <EmptyState
                title={t('uiBulk.noResellersYet')}
                description={t('uiBulk.createYourFirstReseller')}
                actionLabel={t('uiBulk.createReseller')}
                onAction={() => setIsCreateDialogOpen(true)}
                icon={<Users className="h-12 w-12" />}
              />
            </div>
          )}

          {/* Pagination Controls */}
          {filteredResellers.length > 0 && (
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-slate-600">
                {t('content.pagination.range', {
                  start: startIndex + 1,
                  end: Math.min(endIndex, filteredResellers.length),
                  total: filteredResellers.length
                })}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  {t('common.previous')}
                </Button>
                <span className="text-sm text-slate-600">
                  {t('content.pagination.pageOf', {
                    page: currentPage,
                    total: totalPages
                  })}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  {t('common.next')}
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* Edit Credits Dialog */}
          <Dialog open={isEditCreditsDialogOpen} onOpenChange={setIsEditCreditsDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('reseller.editCreditsTitle')}</DialogTitle>
                <DialogDescription>
                  {t('reseller.editCreditsDescription', { username: selectedReseller?.username })}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={editCreditsForm.handleSubmit(handleEditCredits)} className="space-y-4">
                <div>
                  <Label htmlFor="edit-credits">{t('resellerManagement.viewUsersDialog.credits')}</Label>
                  <Input
                    id="edit-credits"
                    type="number"
                    min="0"
                    step="0.1"
                    {...editCreditsForm.register('credits', { valueAsNumber: true })}
                    placeholder="0"
                  />
                  {editCreditsForm.formState.errors.credits && (
                    <p className="text-sm text-red-600 mt-1">
                      {editCreditsForm.formState.errors.credits.message}
                    </p>
                  )}
                </div>
                {updateCreditsMutation.error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      {updateCreditsMutation.error.message}
                    </AlertDescription>
                  </Alert>
                )}
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsEditCreditsDialogOpen(false)}
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button
                    type="submit"
                    disabled={updateCreditsMutation.isPending}
                  >
                    {updateCreditsMutation.isPending ? t('common.saving') : t('reseller.updateCredits')}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* Edit Reseller Dialog */}
          <Dialog open={isResetPasswordDialogOpen} onOpenChange={setIsResetPasswordDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('reseller.editResellerTitle')}</DialogTitle>
                <DialogDescription>
                  {t('reseller.editResellerDescription', { username: selectedReseller?.username })}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={editResellerForm.handleSubmit(handleEditReseller)} className="space-y-4">
                <div>
                  <Label htmlFor="edit-reseller-username">{t('common.username')}</Label>
                  <Input
                    id="edit-reseller-username"
                    {...editResellerForm.register('username')}
                    placeholder={t('common.username')}
                  />
                  {editResellerForm.formState.errors.username && (
                    <p className="text-sm text-red-600 mt-1">
                      {editResellerForm.formState.errors.username.message}
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="edit-reseller-email">{t('common.email')}</Label>
                  <Input
                    id="edit-reseller-email"
                    type="email"
                    {...editResellerForm.register('email')}
                    placeholder={t('common.email')}
                  />
                  {editResellerForm.formState.errors.email && (
                    <p className="text-sm text-red-600 mt-1">
                      {editResellerForm.formState.errors.email.message}
                    </p>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="edit-reseller-active"
                    {...editResellerForm.register('active')}
                    className="rounded border-gray-300"
                    onChange={(e) => editResellerForm.setValue('active', e.target.checked)}
                    checked={editResellerForm.watch('active')}
                  />
                  <Label htmlFor="edit-reseller-active">{t('common.active')}</Label>
                </div>
                {updateResellerMutation.error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      {updateResellerMutation.error.message}
                    </AlertDescription>
                  </Alert>
                )}
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => { }}
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button
                    type="submit"
                    disabled={updateResellerMutation.isPending}
                  >
                    {updateResellerMutation.isPending ? t('common.saving') : t('reseller.updateReseller')}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* Reset Password Dialog */}
          <Dialog open={isResetPasswordDialogOpen} onOpenChange={(open) => {
            // Prevent automatic closing when password is successfully reset
            if (!open && passwordResetSuccess === true) {
              // Don't close automatically when password is shown - user must click "Done"
              return;
            }
            // Allow normal closing behavior for other states
            if (!open) {
              closeResetPasswordDialog();
            } else {
              setIsResetPasswordDialogOpen(open);
            }
          }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('reseller.resetPasswordTitle')}</DialogTitle>
                <DialogDescription>
                  {passwordResetSuccess === true && newPassword ? (
                    <div className="space-y-3">
                      <p>{t('resellerManagement.resetPasswordDialog.successForUser', { username: selectedReseller?.username })}</p>
                      <div className="bg-green-50 p-3 rounded-md border border-green-200">
                        <p className="text-sm text-green-700 mb-2 font-medium">{t('resellerManagement.resetPasswordDialog.newPasswordLabel')}</p>
                        <div className="flex min-w-0 items-center gap-2">
                          <code className="bg-white px-3 py-2 rounded text-lg font-mono flex-1 min-w-0 border border-green-300 text-green-800 break-all">
                            {newPassword}
                          </code>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigator.clipboard.writeText(newPassword)}
                            className="shrink-0 border-green-300 hover:bg-green-50"
                          >
                            {t('resellerManagement.resetPasswordDialog.copy')}
                          </Button>
                        </div>
                        <p className="text-xs text-red-600 mt-2 font-medium">
                          <strong>{t('resellerManagement.resetPasswordDialog.importantLabel')}</strong> {t('resellerManagement.resetPasswordDialog.saveImmediately')}
                        </p>
                      </div>
                    </div>
                  ) : passwordResetSuccess === false ? (
                    <div className="space-y-3">
                      <div className="bg-red-50 p-3 rounded-md border border-red-200">
                        <p className="text-red-700 font-medium">{t('resellerManagement.resetPasswordDialog.errorTitle')}</p>
                        <p className="text-sm text-red-600 mt-1">
                          {resetPasswordMutation.error?.message || t('common.unexpectedErrorDescription')}
                        </p>
                      </div>
                      {newPassword && (
                        <div className="bg-yellow-50 p-3 rounded-md border border-yellow-200">
                          <p className="text-sm text-yellow-700 mb-2 font-medium">
                            {t('resellerManagement.resetPasswordDialog.generatedNotSaved')}
                          </p>
                          <div className="flex min-w-0 items-center gap-2">
                            <code className="bg-white px-2 py-1 rounded text-sm font-mono flex-1 min-w-0 border break-all">
                              {newPassword}
                            </code>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => navigator.clipboard.writeText(newPassword)}
                              className="shrink-0 border-yellow-300"
                            >
                              {t('resellerManagement.resetPasswordDialog.copy')}
                            </Button>
                          </div>
                        </div>
                      )}
                      <p>{t('resellerManagement.resetPasswordDialog.tryAgainQuestion')}</p>
                    </div>
                  ) : newPassword && resetPasswordMutation.isPending ? (
                    <div className="space-y-3">
                      <div className="bg-blue-50 p-3 rounded-md border border-blue-200">
                        <p className="text-blue-800 font-medium">
                          🔄 Generating and resetting password...
                        </p>
                        <p className="text-sm text-blue-600 mt-2">
                          {t('resellerManagement.resetPasswordDialog.generatedLabel')} <code className="bg-white px-2 py-1 rounded text-sm font-mono">{newPassword}</code>
                        </p>
                        <p className="text-sm text-blue-600 mt-2">
                          Sending to server...
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="bg-blue-50 p-3 rounded-md border border-blue-200">
                        <p className="text-blue-800 font-medium">
                          {t('resellerManagement.resetPasswordDialog.resetForUser', { username: selectedReseller?.username })}
                        </p>
                        <p className="text-sm text-blue-600 mt-2">
                          This will generate a new secure password automatically.
                          The current password will be permanently replaced.
                        </p>
                      </div>
                      <p className="text-sm text-gray-600">
                        <strong>{t('resellerManagement.resetPasswordDialog.confirmContinue')}</strong>
                      </p>
                    </div>
                  )}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                {passwordResetSuccess === true ? (
                  <Button
                    onClick={closeResetPasswordDialog}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {t('common.ok')}
                  </Button>
                ) : passwordResetSuccess === false ? (
                  <>
                    <Button
                      variant="outline"
                      onClick={closeResetPasswordDialog}
                    >
                      {t('common.close')}
                    </Button>
                    <Button
                      onClick={() => {
                        resetPasswordMutation.reset();
                        setPasswordResetSuccess(null);
                        handleResetPassword();
                      }}
                      disabled={resetPasswordMutation.isPending}
                      className="bg-orange-600 hover:bg-orange-700"
                    >
                      {t('common.tryAgain')}
                    </Button>
                  </>
                ) : resetPasswordMutation.isPending ? (
                  <div className="flex justify-center w-full">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                    <span className="ml-2 text-blue-600">{t('reseller.processingReset')}</span>
                  </div>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      onClick={closeResetPasswordDialog}
                    >
                      {t('common.cancel')}
                    </Button>
                    <Button
                      onClick={handleResetPassword}
                      className="bg-orange-600 hover:bg-orange-700"
                    >
                      {t('reseller.resetPasswordAction')}
                    </Button>
                  </>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Update Demo Limit Dialog */}
          {selectedReseller && (
            <UpdateDemoLimitDialog
              isOpen={isDemoLimitDialogOpen}
              onClose={() => setIsDemoLimitDialogOpen(false)}
              reseller={selectedReseller}
            />
          )}

          {/* View Reseller Users Dialog */}
          <ViewResellerUsersDialog
            open={isViewUsersDialogOpen}
            onOpenChange={setIsViewUsersDialogOpen}
            reseller={selectedReseller}
          />
        </CardContent>
      </Card>
      <ConfirmationDialog />
    </div>
  );
}
