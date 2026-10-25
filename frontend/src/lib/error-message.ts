const getNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const getMessageFromRecord = (record: Record<string, unknown>): string | null => {
  const details = getNonEmptyString(record.details);
  if (details) return details;

  const errorField = record.error;
  const errorText = getNonEmptyString(errorField);
  if (errorText) return errorText;

  if (typeof errorField === 'object' && errorField !== null) {
    const nestedError = getMessageFromRecord(errorField as Record<string, unknown>);
    if (nestedError) return nestedError;
  }

  const message = getNonEmptyString(record.message);
  if (message) return message;

  return null;
};

export function extractErrorMessage(error: unknown, fallback = 'An error occurred'): string {
  const fallbackText = getNonEmptyString(fallback) ?? 'An error occurred';

  const directErrorText = getNonEmptyString(error);
  if (directErrorText) return directErrorText;

  if (typeof error === 'object' && error !== null) {
    return getMessageFromRecord(error as Record<string, unknown>) ?? fallbackText;
  }

  return fallbackText;
}
