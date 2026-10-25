import { mapLoginErrorMessage } from './authErrorMapping';

describe('AuthContext login error mapping', () => {
  const t = (key: string) => key;

  it.each([
    ['user not found', 'auth.errors.usernameNotFound'],
    ['invalid password', 'auth.errors.incorrectPassword'],
    ['account inactive', 'auth.errors.accountDeactivated'],
    ['authentication failed', 'auth.errors.invalidCredentials'],
    ['forbidden', 'auth.errors.accessDeniedAdminUI'],
    ['Two-factor authentication required', 'Two-factor authentication required'],
    ['2FA code invalid', '2FA code invalid'],
    ['Some other backend error', 'Some other backend error'],
  ])('maps "%s" to "%s"', (backendError, expected) => {
    expect(mapLoginErrorMessage(backendError, t)).toBe(expected);
  });

  it('returns original message for unmapped empty/unknown errors', () => {
    expect(mapLoginErrorMessage('', t)).toBe('');
  });
});
