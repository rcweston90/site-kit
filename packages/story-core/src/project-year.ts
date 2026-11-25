export const PROJECT_YEAR_ERROR = 'Project year must be a four-digit year or left blank.';

export function isOptionalProjectYear(value: unknown): boolean {
  return value === undefined || value === '' || (typeof value === 'string' && /^[1-9]\d{3}$/.test(value));
}
