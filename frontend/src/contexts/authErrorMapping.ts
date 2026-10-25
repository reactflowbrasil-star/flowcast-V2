export function mapLoginErrorMessage(
  errorMessage: string,
  t: (key: string) => string
): string {
  const normalizedMessage = String(errorMessage || '').toLowerCase();

  if (normalizedMessage.includes('user not found')) {
    return t('auth.errors.usernameNotFound');
  }
  if (normalizedMessage.includes('invalid password')) {
    return t('auth.errors.incorrectPassword');
  }
  if (normalizedMessage.includes('account inactive')) {
    return t('auth.errors.accountDeactivated');
  }
  if (normalizedMessage.includes('authentication failed')) {
    return t('auth.errors.invalidCredentials');
  }
  if (normalizedMessage.includes('forbidden')) {
    return t('auth.errors.accessDeniedAdminUI');
  }
  if (normalizedMessage.includes('two-factor') || normalizedMessage.includes('2fa')) {
    return errorMessage || 'Two-factor authentication required';
  }

  return errorMessage;
}
