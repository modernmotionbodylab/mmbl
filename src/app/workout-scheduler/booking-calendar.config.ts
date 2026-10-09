export const bookingCalendarConfig = {
  calEventUrl: 'https://cal.com/modernmotionbodylab/free-demo',
};

export function calEventPath(value: string): string | null {
  try {
    const url = new URL(value);
    const parts = url.pathname.split('/').filter(Boolean);
    if (url.protocol !== 'https:' || !['cal.com', 'app.cal.com'].includes(url.hostname) ||
        parts.length !== 2 || parts.some(part => !/^[a-zA-Z0-9_-]+$/.test(part))) return null;
    return parts.join('/');
  } catch {
    return null;
  }
}
