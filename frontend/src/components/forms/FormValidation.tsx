'use client';

import React from 'react';
import { FieldErrors, FieldValues } from 'react-hook-form';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { CheckCircle, AlertCircle, Info, Shield } from 'lucide-react';
import i18n from '@/lib/i18n';

interface FormValidationSummaryProps<T extends FieldValues> {
  errors: FieldErrors<T>;
  isValid: boolean;
  isDirty: boolean;
  className?: string;
  showProgress?: boolean;
  totalFields?: number;
}

interface PasswordStrengthProps {
  password: string;
  requirements?: {
    minLength?: number;
    requireUppercase?: boolean;
    requireLowercase?: boolean;
    requireNumbers?: boolean;
    requireSpecialChars?: boolean;
  };
  className?: string;
}

interface ValidationRuleProps {
  label: string;
  isValid: boolean;
  isRequired?: boolean;
}

// Form Validation Summary Component
export function FormValidationSummary<T extends FieldValues>({
  errors,
  isValid,
  isDirty,
  className,
  showProgress = false,
  totalFields = 0}: FormValidationSummaryProps<T>) {
  const errorCount = Object.keys(errors).length;
  const validFields = totalFields - errorCount;
  const progressPercentage = totalFields > 0 ? (validFields / totalFields) * 100 : 0;

  if (!isDirty) {
    return null;
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Progress Bar */}
      {showProgress && totalFields > 0 && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">{i18n.t('formValidation.summary.completion')}</span>
            <span className="font-medium">{Math.round(progressPercentage)}%</span>
          </div>
          <Progress value={progressPercentage} className="h-2" />
        </div>
      )}

      {/* Validation Status */}
      {isValid ? (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            {i18n.t('formValidation.summary.valid')}
          </AlertDescription>
        </Alert>
      ) : errorCount > 0 ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {errorCount === 1 
              ? i18n.t('formValidation.summary.oneError')
              : i18n.t('formValidation.summary.manyErrors', { count: errorCount })
            }
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Error List */}
      {errorCount > 0 && (
        <div className="space-y-1">
          <h4 className="text-sm font-medium text-red-900">{i18n.t('formValidation.summary.issuesToResolve')}</h4>
          <ul className="text-sm text-red-700 space-y-1">
            {Object.entries(errors).map(([field, error]) => (
              <li key={field} className="flex items-start gap-2">
                <span className="text-red-500 mt-0.5">•</span>
                <span>
                  <strong className="capitalize">{field.replace(/([A-Z])/g, ' $1').trim()}:</strong>{' '}
                  {String(error?.message) || i18n.t('formValidation.summary.invalidValue')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Password Strength Component
export function PasswordStrength({
  password,
  requirements = {
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true},
  className}: PasswordStrengthProps) {
  const {
    minLength = 8,
    requireUppercase = true,
    requireLowercase = true,
    requireNumbers = true,
    requireSpecialChars = true} = requirements;

  const checks = [
    {
      label: i18n.t('formValidation.password.requirements.minLength', { count: minLength }),
      isValid: password.length >= minLength,
      isRequired: true},
    {
      label: i18n.t('formValidation.password.requirements.uppercase'),
      isValid: /[A-Z]/.test(password),
      isRequired: requireUppercase},
    {
      label: i18n.t('formValidation.password.requirements.lowercase'),
      isValid: /[a-z]/.test(password),
      isRequired: requireLowercase},
    {
      label: i18n.t('formValidation.password.requirements.number'),
      isValid: /\d/.test(password),
      isRequired: requireNumbers},
    {
      label: i18n.t('formValidation.password.requirements.special'),
      isValid: /[!@#$%^&*(),.?":{}|<>]/.test(password),
      isRequired: requireSpecialChars},
  ].filter(check => check.isRequired);

  const validChecks = checks.filter(check => check.isValid).length;
  const strengthPercentage = (validChecks / checks.length) * 100;

  const getStrengthLevel = () => {
    if (strengthPercentage === 100) return { label: i18n.t('formValidation.password.levels.strong'), color: 'text-green-600', bgColor: 'bg-green-500' };
    if (strengthPercentage >= 75) return { label: i18n.t('formValidation.password.levels.good'), color: 'text-yellow-600', bgColor: 'bg-yellow-500' };
    if (strengthPercentage >= 50) return { label: i18n.t('formValidation.password.levels.fair'), color: 'text-orange-600', bgColor: 'bg-orange-500' };
    return { label: i18n.t('formValidation.password.levels.weak'), color: 'text-red-600', bgColor: 'bg-red-500' };
  };

  const strength = getStrengthLevel();

  if (!password) {
    return null;
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Strength Indicator */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium text-gray-700">{i18n.t('formValidation.password.title')}</span>
          <span className={cn('text-sm font-medium', strength.color)}>
            {strength.label}
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={cn('h-2 rounded-full transition-all duration-300', strength.bgColor)}
            style={{ width: `${strengthPercentage}%` }}
          />
        </div>
      </div>

      {/* Requirements Checklist */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">{i18n.t('formValidation.password.requirements.title')}</span>
        </div>
        <div className="space-y-1">
          {checks.map((check, index) => (
            <ValidationRule
              key={index}
              label={check.label}
              isValid={check.isValid}
              isRequired={check.isRequired}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// Validation Rule Component
function ValidationRule({ label, isValid, isRequired = true }: ValidationRuleProps) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {isValid ? (
        <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
      ) : (
        <div className="h-4 w-4 rounded-full border-2 border-gray-300 flex-shrink-0" />
      )}
      <span className={cn(
        isValid ? 'text-green-700' : 'text-gray-600',
        !isRequired && 'italic'
      )}>
        {label}
        {!isRequired && ` (${i18n.t('common.optional')})`}
      </span>
    </div>
  );
}

// Real-time Field Validation Component
interface FieldValidationProps<T = unknown> {
  value: T;
  rules: Array<{
    test: (value: T) => boolean;
    message: string;
    level?: 'error' | 'warning' | 'info';
  }>;
  className?: string;
}

export function FieldValidation({ value, rules, className }: FieldValidationProps) {
  const results = rules.map(rule => ({
    ...rule,
    isValid: rule.test(value)}));

  if (!value || results.every(result => result.isValid)) {
    return null;
  }

  return (
    <div className={cn('space-y-1', className)}>
      {results
        .filter(result => !result.isValid)
        .map((result, index) => {
          const level = result.level || 'error';
          const icons = {
            error: AlertCircle,
            warning: AlertCircle,
            info: Info};
          const colors = {
            error: 'text-red-600',
            warning: 'text-yellow-600',
            info: 'text-blue-600'};
          
          const Icon = icons[level];
          
          return (
            <div key={index} className={cn('flex items-center gap-1 text-xs', colors[level])}>
              <Icon className="h-3 w-3 flex-shrink-0" />
              <span>{result.message}</span>
            </div>
          );
        })}
    </div>
  );
}

// Form Section Validation Component
interface FormSectionValidationProps<T extends FieldValues = FieldValues> {
  title: string;
  fields: string[];
  errors: FieldErrors<T>;
  className?: string;
}

export function FormSectionValidation({
  title,
  fields,
  errors,
  className}: FormSectionValidationProps) {
  const sectionErrors = fields.filter(field => errors[field]);
  const isValid = sectionErrors.length === 0;
  const completionPercentage = ((fields.length - sectionErrors.length) / fields.length) * 100;

  return (
    <div className={cn('p-3 border rounded-lg', className, {
      'border-green-200 bg-green-50': isValid,
      'border-red-200 bg-red-50': !isValid})}>
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-medium text-sm">{title}</h4>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600">
            {Math.round(completionPercentage)}%
          </span>
          {isValid ? (
            <CheckCircle className="h-4 w-4 text-green-600" />
          ) : (
            <AlertCircle className="h-4 w-4 text-red-600" />
          )}
        </div>
      </div>
      
      <Progress value={completionPercentage} className="h-1 mb-2" />
      
      {sectionErrors.length > 0 && (
        <div className="text-xs text-red-700">
          {sectionErrors.length} field{sectionErrors.length !== 1 ? 's' : ''} need{sectionErrors.length === 1 ? 's' : ''} attention
        </div>
      )}
    </div>
  );
}
