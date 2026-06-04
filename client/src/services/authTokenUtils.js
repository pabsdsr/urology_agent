const DEFAULT_REFRESH_BUFFER_MS = 5 * 60 * 1000;

export const TOKEN_REFRESH_BUFFER_MS = Number(
  import.meta.env.VITE_TOKEN_REFRESH_BUFFER_MS
) > 0
  ? Number(import.meta.env.VITE_TOKEN_REFRESH_BUFFER_MS)
  : DEFAULT_REFRESH_BUFFER_MS;

export function getJwtExpiryMs(token) {
  try {
    const payload = token.split('.')[1];
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(atob(normalized));
    return typeof decoded.exp === 'number' ? decoded.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

export function isTokenExpired(token) {
  const expiry = getJwtExpiryMs(token);
  return !expiry || expiry <= Date.now();
}

export function isTokenExpiringSoon(token, bufferMs = TOKEN_REFRESH_BUFFER_MS) {
  const expiry = getJwtExpiryMs(token);
  if (!expiry) return true;
  return expiry - Date.now() < bufferMs;
}
