export function getNormalizedApiUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    let rawUrl = process.env.NEXT_PUBLIC_API_URL.trim().replace(/\/+$/, '');
    if (!rawUrl.endsWith('/api')) rawUrl = `${rawUrl}/api`;
    return rawUrl;
  }
  if (typeof window !== 'undefined' && window.location.port === '3000') {
    return 'http://localhost:5000/api';
  }
  return '/api';
}
