import { extractErrorMessage } from './error-message';

describe('extractErrorMessage', () => {
  test('prioritizes details over error and message', () => {
    expect(
      extractErrorMessage({
        details: 'Detailed message',
        error: 'Error message',
        message: 'Generic message'}, 'Fallback message')
    ).toBe('Detailed message');
  });

  test('uses error when details is missing', () => {
    expect(
      extractErrorMessage({
        error: 'Error message',
        message: 'Generic message'}, 'Fallback message')
    ).toBe('Error message');
  });

  test('uses message when details and error are missing', () => {
    expect(
      extractErrorMessage({
        message: 'Generic message'}, 'Fallback message')
    ).toBe('Generic message');
  });

  test('reads nested error objects safely', () => {
    expect(
      extractErrorMessage({
        error: {
          details: 'Nested details'}}, 'Fallback message')
    ).toBe('Nested details');
  });

  test('falls back for empty values', () => {
    expect(extractErrorMessage({ details: '   ' }, 'Fallback message')).toBe('Fallback message');
    expect(extractErrorMessage('', 'Fallback message')).toBe('Fallback message');
    expect(extractErrorMessage(null, 'Fallback message')).toBe('Fallback message');
  });
});
