'use client';

import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Clock, Users, Plus, AlertTriangle, CheckCircle, Timer, Zap } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { resellerService } from '@/services/reseller';
import { useAuth } from '@/contexts/AuthContext';
import { CreateDemoRequest } from '@/types';
import { useCategories } from '@/hooks/useCategories';
import { getDisplayCategoryName } from '@/lib/categoryUtils';
import { useUsernameValidation } from '@/hooks/useUsernameValidation';
import { UsernameInputWithValidation } from '@/components/ui/username-validator';
import { useTranslation } from 'react-i18next';
import useLoadNamespace from '@/hooks/useLoadNamespace';

interface DemoManagementProps {
  className?: string;
  autoOpenCreate?: boolean;
}

type CreateDemoFormData = {
  username: string;
  password: string;
  email?: string;
  category_ids: number[];
};

export default function DemoManagement({ className, autoOpenCreate = false }: DemoManagementProps) {
  useLoadNamespace('reseller/demoManagement');
  const { t } = useTranslation('reseller/demoManagement');
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(autoOpenCreate);
  const createDemoSchema = useMemo(() => z.object({
    username: z.string().min(3, t('validation.usernameMin')),
    password: z.string().min(6, t('validation.passwordMin')),
    email: z.string().email(t('validation.invalidEmail')).optional().or(z.literal('')),
    category_ids: z.array(z.number()).min(1, t('validation.categoryRequired'))
  }), [t]);

  // Fetch available categories
  const { data: categories, isLoading: categoriesLoading } = useCategories();

  // Form for creating demo users
  const createForm = useForm<CreateDemoFormData>({
    resolver: zodResolver(createDemoSchema),
    defaultValues: {
      username: '',
      password: '',
      email: '',
      category_ids: []}});

  // Username validation
  const watchedUsername = createForm.watch('username');
  const usernameValidation = useUsernameValidation(watchedUsername);

  // Fetch demo statistics
  const { data: demoStats, isLoading: statsLoading, error: statsError } = useQuery({
    queryKey: ['demo-stats', currentUser?.id],
    queryFn: async () => {
      const result = await resellerService.getDemoStats();
      if (result.success) {
        return result.data;
      }
      throw new Error(result.error.details);
    },
    enabled: !!currentUser?.id,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch demo config (duration hours)
  const { data: demoConfig } = useQuery({
    queryKey: ['demo-config'],
    queryFn: async () => {
      const response = await fetch('/api/demo/status');
      if (!response.ok) throw new Error(t('error.fetchConfigFailed'));
      return response.json();
    },
    staleTime: 60000});

  // Create demo user mutation
  const createDemoMutation = useMutation({
    mutationFn: async (data: CreateDemoFormData) => {
      const demoRequest: CreateDemoRequest = {
        username: data.username,
        password: data.password,
        email: data.email || undefined,
        category_ids: data.category_ids};

      const result = await resellerService.createDemoUser(demoRequest);
      if (result.success) {
        return result.data;
      }
      throw new Error(result.error.details);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demo-stats'] });
      queryClient.invalidateQueries({ queryKey: ['reseller-users'] });
      setIsCreateDialogOpen(false);
      createForm.reset();
    }});

  const handleCreateDemo = (data: CreateDemoFormData) => {
    createDemoMutation.mutate(data);
  };

  const canCreateDemo = demoStats && demoStats.demos_remaining_today > 0;

  if (statsLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (statsError) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {t('error.loadFailed')}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Demo Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card className={className}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('stats.dailyLimit')}</CardTitle>
            <Timer className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{demoStats?.daily_limit || 0}</div>
            <p className="text-xs text-muted-foreground">
              {t('stats.dailyLimitDesc')}
            </p>
          </CardContent>
        </Card>

        <Card className={className}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('stats.createdToday')}</CardTitle>
            <Users className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{demoStats?.demos_created_today || 0}</div>
            <p className="text-xs text-muted-foreground">
              {t('stats.createdTodayDesc')}
            </p>
          </CardContent>
        </Card>

        <Card className={className}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('stats.remainingToday')}</CardTitle>
            <Zap className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {demoStats?.demos_remaining_today || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {t('stats.remainingTodayDesc')}
            </p>
          </CardContent>
        </Card>

        <Card className={className}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('stats.activeDemos')}</CardTitle>
            <Users className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{demoStats?.active_demos || 0}</div>
            <p className="text-xs text-muted-foreground">
              {t('stats.activeDemosDesc')}
            </p>
          </CardContent>
        </Card>

        <Card className={className}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('stats.demoDuration')}</CardTitle>
            <Clock className="h-4 w-4 text-cyan-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{demoConfig?.duration_hours || 12}h</div>
            <p className="text-xs text-muted-foreground">
              {t('stats.demoDurationDesc')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Create Demo Section */}
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            {t('createDemo.title')}
          </CardTitle>
          <CardDescription>
            {t('createDemo.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Status Alert */}
            {demoStats && (
              <Alert variant={canCreateDemo ? "default" : "destructive"}>
                {canCreateDemo ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <AlertTriangle className="h-4 w-4" />
                )}
                <AlertDescription>
                  {canCreateDemo ? (
                    demoStats.demos_remaining_today === 1
                      ? t('status.canCreate', { count: demoStats.demos_remaining_today })
                      : t('status.canCreatePlural', { count: demoStats.demos_remaining_today })
                  ) : (
                    t('status.limitReached', {
                      created: demoStats.demos_created_today,
                      limit: demoStats.daily_limit
                    })
                  )}
                </AlertDescription>
              </Alert>
            )}

            {/* Create Demo Button */}
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button 
                  disabled={!canCreateDemo || createDemoMutation.isPending}
                  className="w-full"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  {t('createDemo.title')}
                </Button>
              </DialogTrigger>
              <DialogContent className="!max-w-[65vw] !w-[65vw] max-h-[75vh] overflow-y-auto sm:!max-w-[65vw] md:!max-w-[65vw] lg:!max-w-[65vw]" style={{ width: '65vw', maxWidth: '65vw' }}>
                <DialogHeader>
                  <DialogTitle>{t('createDemo.dialogTitle')}</DialogTitle>
                  <DialogDescription>
                    {t('createDemo.dialogDescription')}
                  </DialogDescription>
                </DialogHeader>

                <Form {...createForm}>
                  <form onSubmit={createForm.handleSubmit(handleCreateDemo)} className="space-y-4">
                    <FormField
                      control={createForm.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('form.username')}</FormLabel>
                          <FormControl>
                            <div>
                              <UsernameInputWithValidation
                                value={field.value || ''}
                                onChange={(value) => field.onChange(value)}
                                validation={usernameValidation}
                                placeholder={t('form.usernamePlaceholder')}
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={createForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('form.password')}</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder={t('form.passwordPlaceholder')} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={createForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('form.email')}</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder={t('form.emailPlaceholder')} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={createForm.control}
                      name="category_ids"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('form.categories')}</FormLabel>
                          <FormControl>
                            <div className="space-y-3">
                              {categoriesLoading ? (
                                <p className="text-sm text-gray-500">{t('form.loadingCategories')}</p>
                              ) : categories && categories.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                  {categories.map((category) => {
                                    const isSelected = field.value.includes(category.id);
                                    return (
                                      <Button
                                        key={category.id}
                                        type="button"
                                        variant={isSelected ? "default" : "outline"}
                                        size="sm"
                                        className={`transition-all duration-200 ${
                                          isSelected
                                            ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md'
                                            : 'hover:bg-gray-50 hover:border-gray-300'
                                        }`}
                                        onClick={() => {
                                          if (isSelected) {
                                            field.onChange(field.value.filter((id: number) => id !== category.id));
                                          } else {
                                            field.onChange([...field.value, category.id]);
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
                                <p className="text-sm text-gray-500">{t('form.noCategories')}</p>
                              )}
                            </div>
                          </FormControl>
                          <FormMessage />
                          <p className="text-sm text-gray-500 mt-1">
                            {t('form.categoriesHint')}
                          </p>
                        </FormItem>
                      )}
                    />

                    {createDemoMutation.error && (
                      <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          {createDemoMutation.error.message}
                        </AlertDescription>
                      </Alert>
                    )}

                    <div className="flex justify-end space-x-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsCreateDialogOpen(false)}
                      >
                        {t('actions.cancel')}
                      </Button>
                      <Button
                        type="submit"
                        disabled={createDemoMutation.isPending}
                      >
                        {createDemoMutation.isPending ? t('actions.creating') : t('actions.createDemo')}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      {/* Demo Information */}
      <Card className={className}>
        <CardHeader>
          <CardTitle>{t('info.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-500" />
              <span><strong>{t('info.duration')}</strong> {t('info.durationValue', { hours: demoConfig?.duration_hours || 12 })}</span>
            </div>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-green-500" />
              <span><strong>{t('info.access')}</strong> {t('info.accessValue')}</span>
            </div>
            <div className="flex items-center gap-2">
              <Timer className="h-4 w-4 text-orange-500" />
              <span><strong>{t('info.devices')}</strong> {t('info.devicesValue')}</span>
            </div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <span><strong>{t('info.autoCleanup')}</strong> {t('info.autoCleanupValue')}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
