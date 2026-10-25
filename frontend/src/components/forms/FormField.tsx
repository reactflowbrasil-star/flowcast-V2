'use client';

import React from 'react';
import { Control, FieldPath, FieldValues, useController } from 'react-hook-form';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { AlertCircle, Eye, EyeOff, CheckCircle, Info } from 'lucide-react';

interface BaseFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  label?: string;
  description?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}

interface TextFieldProps<T extends FieldValues> extends BaseFieldProps<T> {
  type?: 'text' | 'email' | 'password' | 'number' | 'url' | 'tel';
  maxLength?: number;
  minLength?: number;
  pattern?: string;
  autoComplete?: string;
  showPasswordToggle?: boolean;
  showValidation?: boolean;
}

interface TextareaFieldProps<T extends FieldValues> extends BaseFieldProps<T> {
  rows?: number;
  maxLength?: number;
  resize?: boolean;
  showValidation?: boolean;
}

interface CheckboxFieldProps<T extends FieldValues> extends BaseFieldProps<T> {
  checkboxLabel?: string;
}

interface NumberFieldProps<T extends FieldValues> extends BaseFieldProps<T> {
  min?: number;
  max?: number;
  step?: number;
  showValidation?: boolean;
}

// Text Input Field
export function TextField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  placeholder,
  disabled = false,
  required = false,
  className,
  showValidation = true,
  type = 'text',
  maxLength,
  minLength,
  pattern,
  autoComplete,
  showPasswordToggle = false,
  ...props
}: TextFieldProps<T>) {
  const [showPassword, setShowPassword] = React.useState(false);
  const {
    field,
    fieldState: { error, invalid, isDirty }} = useController({
    name,
    control});

  const inputType = type === 'password' && showPassword ? 'text' : type;
  const hasError = invalid && isDirty;
  const isValid = !invalid && isDirty && field.value;

  return (
    <div className={cn('space-y-2', className)}>
      {label && (
        <Label htmlFor={name} className={cn(required && 'after:content-["*"] after:ml-0.5 after:text-red-500')}>
          {label}
        </Label>
      )}
      
      <div className="relative">
        <Input
          {...field}
          id={name}
          type={inputType}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={maxLength}
          minLength={minLength}
          pattern={pattern}
          autoComplete={autoComplete}
          className={cn(
            hasError && 'border-red-500 focus:border-red-500 focus:ring-red-500',
            isValid && showValidation && 'border-green-500 focus:border-green-500 focus:ring-green-500',
            'pr-10'
          )}
          {...props}
        />
        
        {/* Password toggle */}
        {type === 'password' && showPasswordToggle && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
            onClick={() => setShowPassword(!showPassword)}
            disabled={disabled}
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4 text-gray-400" />
            ) : (
              <Eye className="h-4 w-4 text-gray-400" />
            )}
          </Button>
        )}
        
        {/* Validation icons */}
        {showValidation && !showPasswordToggle && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {hasError && <AlertCircle className="h-4 w-4 text-red-500" />}
            {isValid && <CheckCircle className="h-4 w-4 text-green-500" />}
          </div>
        )}
      </div>

      {/* Description */}
      {description && !error && (
        <div className="flex items-center gap-1 text-sm text-gray-600">
          <Info className="h-3 w-3" />
          <span>{description}</span>
        </div>
      )}

      {/* Character count */}
      {maxLength && field.value && (
        <div className="text-xs text-gray-500 text-right">
          {field.value.length}/{maxLength}
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="flex items-center gap-1 text-sm text-red-600">
          <AlertCircle className="h-3 w-3" />
          <span>{error.message}</span>
        </div>
      )}
    </div>
  );
}

// Textarea Field
export function TextareaField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  placeholder,
  disabled = false,
  required = false,
  className,
  showValidation = true,
  rows = 3,
  maxLength,
  resize = true,
  ...props
}: TextareaFieldProps<T>) {
  const {
    field,
    fieldState: { error, invalid, isDirty }} = useController({
    name,
    control});

  const hasError = invalid && isDirty;
  const isValid = !invalid && isDirty && field.value;

  return (
    <div className={cn('space-y-2', className)}>
      {label && (
        <Label htmlFor={name} className={cn(required && 'after:content-["*"] after:ml-0.5 after:text-red-500')}>
          {label}
        </Label>
      )}
      
      <div className="relative">
        <Textarea
          {...field}
          id={name}
          placeholder={placeholder}
          disabled={disabled}
          rows={rows}
          maxLength={maxLength}
          className={cn(
            hasError && 'border-red-500 focus:border-red-500 focus:ring-red-500',
            isValid && showValidation && 'border-green-500 focus:border-green-500 focus:ring-green-500',
            !resize && 'resize-none'
          )}
          {...props}
        />
        
        {/* Validation icons */}
        {showValidation && (
          <div className="absolute right-3 top-3">
            {hasError && <AlertCircle className="h-4 w-4 text-red-500" />}
            {isValid && <CheckCircle className="h-4 w-4 text-green-500" />}
          </div>
        )}
      </div>

      {/* Description */}
      {description && !error && (
        <div className="flex items-center gap-1 text-sm text-gray-600">
          <Info className="h-3 w-3" />
          <span>{description}</span>
        </div>
      )}

      {/* Character count */}
      {maxLength && field.value && (
        <div className="text-xs text-gray-500 text-right">
          {field.value.length}/{maxLength}
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="flex items-center gap-1 text-sm text-red-600">
          <AlertCircle className="h-3 w-3" />
          <span>{error.message}</span>
        </div>
      )}
    </div>
  );
}

// Checkbox Field
export function CheckboxField<T extends FieldValues>({
  control,
  name,
  label,
  checkboxLabel,
  description,
  disabled = false,
  required = false,
  className}: CheckboxFieldProps<T>) {
  const {
    field,
    fieldState: { error, invalid, isDirty }} = useController({
    name,
    control});

  const hasError = invalid && isDirty;

  return (
    <div className={cn('space-y-2', className)}>
      {label && (
        <Label className={cn(required && 'after:content-["*"] after:ml-0.5 after:text-red-500')}>
          {label}
        </Label>
      )}
      
      <div className="flex items-center space-x-2">
        <Checkbox
          id={name}
          checked={field.value}
          onCheckedChange={field.onChange}
          disabled={disabled}
          className={cn(
            hasError && 'border-red-500 data-[state=checked]:bg-red-500'
          )}
        />
        {checkboxLabel && (
          <Label
            htmlFor={name}
            className="text-sm font-normal cursor-pointer"
          >
            {checkboxLabel}
          </Label>
        )}
      </div>

      {/* Description */}
      {description && !error && (
        <div className="flex items-center gap-1 text-sm text-gray-600">
          <Info className="h-3 w-3" />
          <span>{description}</span>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="flex items-center gap-1 text-sm text-red-600">
          <AlertCircle className="h-3 w-3" />
          <span>{error.message}</span>
        </div>
      )}
    </div>
  );
}

// Number Field
export function NumberField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  placeholder,
  disabled = false,
  required = false,
  className,
  showValidation = true,
  min,
  max,
  step,
  ...props
}: NumberFieldProps<T>) {
  const {
    field,
    fieldState: { error, invalid, isDirty }} = useController({
    name,
    control});

  const hasError = invalid && isDirty;
  const isValid = !invalid && isDirty && field.value !== undefined && field.value !== '';

  return (
    <div className={cn('space-y-2', className)}>
      {label && (
        <Label htmlFor={name} className={cn(required && 'after:content-["*"] after:ml-0.5 after:text-red-500')}>
          {label}
        </Label>
      )}
      
      <div className="relative">
        <Input
          {...field}
          id={name}
          type="number"
          placeholder={placeholder}
          disabled={disabled}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const value = e.target.value;
            field.onChange(value === '' ? undefined : Number(value));
          }}
          className={cn(
            hasError && 'border-red-500 focus:border-red-500 focus:ring-red-500',
            isValid && showValidation && 'border-green-500 focus:border-green-500 focus:ring-green-500',
            'pr-10'
          )}
          {...props}
        />
        
        {/* Validation icons */}
        {showValidation && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {hasError && <AlertCircle className="h-4 w-4 text-red-500" />}
            {isValid && <CheckCircle className="h-4 w-4 text-green-500" />}
          </div>
        )}
      </div>

      {/* Description */}
      {description && !error && (
        <div className="flex items-center gap-1 text-sm text-gray-600">
          <Info className="h-3 w-3" />
          <span>{description}</span>
        </div>
      )}

      {/* Min/Max info */}
      {(min !== undefined || max !== undefined) && !error && (
        <div className="text-xs text-gray-500">
          {min !== undefined && max !== undefined && `Range: ${min} - ${max}`}
          {min !== undefined && max === undefined && `Minimum: ${min}`}
          {min === undefined && max !== undefined && `Maximum: ${max}`}
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="flex items-center gap-1 text-sm text-red-600">
          <AlertCircle className="h-3 w-3" />
          <span>{error.message}</span>
        </div>
      )}
    </div>
  );
}
