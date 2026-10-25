'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TextField, CheckboxField } from '@/components/forms/FormField';
import { FormValidationSummary, PasswordStrength } from '@/components/forms/FormValidation';
import { FormFeedback } from '@/components/feedback/UserFeedback';
import { LoadingOverlay } from '@/components/ui/loading';
import { useFormSubmission } from '@/hooks/useAsyncOperation';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { authService } from '@/services';
import { apiService } from '@/services/api';
import type { LoginResponse } from '@/types/auth';
import { LogIn } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// Login form schema will be created inside the component to allow translations
type LoginFormData = {
  username: string;
  password: string;
  rememberMe: boolean;
};

interface EnhancedLoginFormProps {
  onSuccess?: () => void;
  className?: string;
  showPasswordStrength?: boolean;
  allowRememberMe?: boolean;
}

export default function EnhancedLoginForm({
  onSuccess,
  className,
  showPasswordStrength = false,
  allowRememberMe = true}: EnhancedLoginFormProps) {
  const { handleApiError } = useErrorHandler();

  const { t } = useTranslation();

  const loginSchema = z.object({
    username: z
      .string()
      .min(1, t('validation.usernameRequired', {}))
      .max(255, t('validation.usernameTooLong', {})),
    password: z
      .string()
      .min(1, t('validation.passwordRequired', {}))
      .min(8, t('validation.passwordMinLength', {}))
      .max(128, t('validation.passwordTooLong', {})),
    rememberMe: z.boolean()});

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: '',
      password: '',
      rememberMe: false},
    mode: 'onChange'});

  // Enhanced form submission with error handling
  const {
    submit,
    isLoading,
    error: submitError,
    isSuccess} = useFormSubmission<LoginResponse, LoginFormData>(
    async (data: LoginFormData) => {
      const result = await authService.login({
        username: data.username,
        password: data.password});

      if (result.success) {
        return result.data;
      }
      throw new Error(result.error.details);
    },
    {
      successMessage: t('login.loginSuccess'),
      onSuccess: (data: LoginResponse) => {
        // Store auth data using the correct centralized keys
        // SECURITY FIX: was using 'auth_token' but the rest of the app reads STORAGE_KEYS.AUTH_TOKEN ('iptv_auth_token')
        apiService.setAuthToken(data.token);
        localStorage.setItem('iptv_user_data', JSON.stringify(data.user));

        // Call success callback
        onSuccess?.();
      },
      onError: (error) => {
        handleApiError(error, 'Login');
      }}
  );

  const handleSubmit = (data: LoginFormData) => {
    submit(data);
  };

  const { errors, isValid, isDirty } = form.formState;
  const watchedPassword = form.watch('password');

  return (
    <Card className={className}>
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl flex items-center gap-2">
          <LogIn className="h-6 w-6" />
          {t('login.signIn')}
        </CardTitle>
        <CardDescription>
          {t('login.enterCredentials')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <LoadingOverlay isLoading={isLoading} message={t('login.authenticating')}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            {/* Form Validation Summary */}
            <FormValidationSummary
              errors={errors}
              isValid={isValid}
              isDirty={isDirty}
              showProgress={true}
              totalFields={2} // username and password
            />

            {/* Username Field */}
            <TextField
              control={form.control}
              name="username"
              label={t('login.username')}
              type="text"
              placeholder={t('login.usernamePlaceholder')}
              required
              autoComplete="username"
              description={t('login.usernameDescription')}
              disabled={isLoading}
            />

            {/* Password Field */}
            <div className="space-y-3">
              <TextField
                control={form.control}
                name="password"
                label={t('login.password')}
                type="password"
                placeholder={t('login.passwordPlaceholder')}
                required
                autoComplete="current-password"
                showPasswordToggle={true}
                disabled={isLoading}
              />

              {/* Password Strength Indicator (optional) */}
              {showPasswordStrength && watchedPassword && (
                <PasswordStrength
                  password={watchedPassword}
                  requirements={{
                    minLength: 8,
                    requireUppercase: false, // More lenient for login
                    requireLowercase: false,
                    requireNumbers: false,
                    requireSpecialChars: false}}
                />
              )}
            </div>

            {/* Remember Me Checkbox */}
            {allowRememberMe && (
              <CheckboxField
                control={form.control}
                name="rememberMe"
                checkboxLabel={t('login.rememberMeLabel')}
                description={t('login.rememberMeDescription')}
                disabled={isLoading}
              />
            )}

            {/* Form Feedback */}
            <FormFeedback
              isSubmitting={isLoading}
              isValid={isValid}
              isDirty={isDirty}
              submitError={submitError || undefined}
              submitSuccess={isSuccess ? t('login.loginSuccess') : undefined}
            />

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || !isValid}
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  {t('login.authenticating')}
                </>
              ) : (
                <>
                  <LogIn className="h-4 w-4 mr-2" />
                  {t('login.signIn')}
                </>
              )}
            </Button>

            {/* Additional Actions */}
            <div className="text-center space-y-2">
              <Button
                type="button"
                variant="link"
                className="text-sm"
                disabled={isLoading}
              >
                {t('login.forgotPassword')}
              </Button>
              <div className="text-sm text-gray-600">
                {t('login.noAccountPrompt')}{' '}
                <Button
                  type="button"
                  variant="link"
                  className="p-0 h-auto text-sm"
                  disabled={isLoading}
                >
                  {t('login.contactAdmin')}
                </Button>
              </div>
            </div>
          </form>
        </LoadingOverlay>
      </CardContent>
    </Card>
  );
}

export function LoginFormExamples() {
  const { t } = useTranslation();
  return (
    <div className="space-y-8 max-w-md mx-auto p-4">
      <h2 className="text-2xl font-bold text-center">{t('login.examples.title', {})}</h2>

      <div>
        <h3 className="text-lg font-medium mb-4">{t('login.examples.basic', {})}</h3>
        <EnhancedLoginForm />
      </div>

      <div>
        <h3 className="text-lg font-medium mb-4">{t('login.examples.withStrength', {})}</h3>
        <EnhancedLoginForm
          showPasswordStrength={true}
          onSuccess={() => console.log(t('login.loginSuccess'))}
        />
      </div>

      <div>
        <h3 className="text-lg font-medium mb-4">{t('login.examples.minimal', {})}</h3>
        <EnhancedLoginForm
          allowRememberMe={false}
          showPasswordStrength={false}
        />
      </div>
    </div>
  );
}
