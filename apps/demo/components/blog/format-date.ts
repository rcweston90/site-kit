/**
 * A post's date, printed the same on the server and in every browser: dates
 * are stored in UTC, so without a fixed time zone a browser west of UTC would
 * print the day before and the page would fail to hydrate.
 */
export function formatBlogDate(date: string | Date, month: 'long' | 'short' = 'long'): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month,
    day: 'numeric',
    timeZone: 'UTC',
  });
}
