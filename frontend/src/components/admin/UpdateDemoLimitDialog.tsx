'use client';

import { useTranslation } from 'react-i18next';
import useLoadNamespace from '@/hooks/useLoadNamespace';

import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Clock, AlertTriangle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { userService } from '@/services/user';
import { User, UpdateResellerDemoLimitRequest } from '@/types';
import { extractErrorMessage } from '@/lib/error-message';
import i18n from '@/lib/i18n';

interface UpdateDemoLimitDialogProps {
  isOpen: boolean;
  onClose: () => void;
  reseller: User;
}

const updateDemoLimitSchema = z.object({
  daily_demo_limit: z.number().min(0, i18n.t('errors.invalidData')).max(100, i18n.t('errors.invalidData'))});

type UpdateDemoLimitFormData = z.infer<typeof updateDemoLimitSchema>;

export default function UpdateDemoLimitDialog({ isOpen, onClose, reseller }: UpdateDemoLimitDialogProps) {
  useLoadNamespace('admin/demos');
  const { t } = useTranslation('admin/demos');
  const queryClient = useQueryClient();

  // Form for updating demo limit
  const form = useForm<UpdateDemoLimitFormData>({
    resolver: zodResolver(updateDemoLimitSchema),
    defaultValues: {
      daily_demo_limit: reseller.daily_demo_limit || 0}});

  // Update demo limit mutation
  const updateDemoLimitMutation = useMutation({
    mutationFn: async (data: UpdateDemoLimitFormData) => {
      const request: UpdateResellerDemoLimitRequest = {
        daily_demo_limit: data.daily_demo_limit};

      const result = await userService.updateResellerDemoLimit(reseller.id, request);
      if (result.success) {
        return result.data;
      }
      throw new Error(extractErrorMessage(result.error, t('common.serverError')));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['resellers'] });
      onClose();
      form.reset();
    }});

  const handleSubmit = (data: UpdateDemoLimitFormData) => {
    updateDemoLimitMutation.mutate(data);
  };

  const handleClose = () => {
    onClose();
    form.reset();
    updateDemoLimitMutation.reset();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="!max-w-[65vw] !w-[65vw] max-h-[75vh] overflow-y-auto sm:!max-w-[65vw] md:!max-w-[65vw] lg:!max-w-[65vw]" style={{ width: '65vw', maxWidth: '65vw' }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            {t('demos.updateLimitDialog.title', { username: reseller.username })}
          </DialogTitle>
          <DialogDescription>
            {t('demos.updateLimitDialog.description')}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            <div className="space-y-4">
              {/* Current Status */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium mb-2">{t('demos.updateLimitDialog.currentStatus')}</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">{t('demos.updateLimitDialog.currentLimit')}</span>
                    <span className="ml-2 font-medium">{reseller.daily_demo_limit || 0} {t('demos.updateLimitDialog.demosDay')}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">{t('demos.updateLimitDialog.createdToday')}</span>
                    <span className="ml-2 font-medium">{reseller.demos_created_today || 0}</span>
                  </div>
                </div>
              </div>

              {/* Demo Limit Input */}
              <FormField
                control={form.control}
                name="daily_demo_limit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('demos.updateLimitDialog.dailyDemoLimit')}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        placeholder={t('demos.updateLimitDialog.placeholder')}
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                    <p className="text-sm text-gray-600">
                      {t('demos.updateLimitDialog.help')}
                    </p>
                  </FormItem>
                )}
              />

              {/* Demo Information */}
              <div className="bg-blue-50 p-4 rounded-lg">
                <h4 className="font-medium mb-2 text-blue-900">{t('demos.updateLimitDialog.demoUserInfo')}</h4>
                <div className="space-y-2 text-sm text-blue-800">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    <span><strong>{t('demos.updateLimitDialog.info.durationLabel')}</strong> {t('demos.updateLimitDialog.info.durationValue')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    <span><strong>{t('demos.updateLimitDialog.info.accessLabel')}</strong> {t('demos.updateLimitDialog.info.accessValue')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    <span><strong>{t('demos.updateLimitDialog.info.devicesLabel')}</strong> {t('demos.updateLimitDialog.info.devicesValue')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    <span><strong>{t('demos.updateLimitDialog.info.autoCleanupLabel')}</strong> {t('demos.updateLimitDialog.info.autoCleanupValue')}</span>
                  </div>
                </div>
              </div>
            </div>

            {updateDemoLimitMutation.error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {updateDemoLimitMutation.error.message}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end space-x-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={updateDemoLimitMutation.isPending}
              >
                {t('demos.updateLimitDialog.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={updateDemoLimitMutation.isPending}
              >
                {updateDemoLimitMutation.isPending ? t('demos.updateLimitDialog.updating') : t('demos.updateLimitDialog.updateButton')}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
