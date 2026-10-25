import React from 'react';
import { CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface UsernameValidatorProps {
  validation: {
    isAvailable: boolean | null;
    isChecking: boolean;
    message: string;
    color: string;
    isValid: boolean | null;
    error?: string;
  };
  className?: string;
}

export const UsernameValidator: React.FC<UsernameValidatorProps> = ({
  validation,
  className
}) => {
  const getIcon = () => {
    if (validation.isChecking) {
      return <Loader2 className="h-4 w-4 animate-spin text-blue-500 dark:text-blue-400" />;
    }

    if (validation.error) {
      return <AlertCircle className="h-4 w-4 text-red-500 dark:text-red-400" />;
    }

    if (validation.isValid === true) {
      return <CheckCircle className="h-4 w-4 text-green-500 dark:text-green-400" />;
    }

    if (validation.isValid === false) {
      return <XCircle className="h-4 w-4 text-red-500 dark:text-red-400" />;
    }

    return null;
  };

  const getTextColor = () => {
    if (validation.isChecking) return 'text-blue-600 dark:text-blue-400';
    if (validation.error) return 'text-red-600 dark:text-red-400';
    if (validation.isValid === true) return 'text-green-600 dark:text-green-400';
    if (validation.isValid === false) return 'text-red-600 dark:text-red-400';
    return 'text-gray-500 dark:text-gray-400';
  };

  if (!validation.message) {
    return null;
  }

  return (
    <div className={cn('flex items-center gap-2 text-sm', className)}>
      {getIcon()}
      <span className={getTextColor()}>
        {validation.message}
      </span>
    </div>
  );
};

interface UsernameInputWithValidationProps {
  value: string;
  onChange: (value: string) => void;
  validation: {
    isAvailable: boolean | null;
    isChecking: boolean;
    message: string;
    color: string;
    isValid: boolean | null;
    error?: string;
  };
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export const UsernameInputWithValidation: React.FC<UsernameInputWithValidationProps> = ({
  value,
  onChange,
  validation,
  placeholder,
  className,
  disabled = false
}) => {
  const { t } = useTranslation();
  const resolvedPlaceholder = placeholder ?? t('login.usernamePlaceholder');

  const getInputBorderColor = () => {
    if (validation.isChecking) return 'border-blue-300 focus:border-blue-500';
    if (validation.error) return 'border-red-300 focus:border-red-500';
    if (validation.isValid === true) return 'border-green-300 focus:border-green-500';
    if (validation.isValid === false) return 'border-red-300 focus:border-red-500';
    return 'border-gray-300 focus:border-gray-500';
  };

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={resolvedPlaceholder}
        disabled={disabled}
        className={cn(
          'w-full px-3 py-2 border rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-1',
          getInputBorderColor(),
          className
        )}
      />
      <UsernameValidator validation={validation} />
    </div>
  );
};
