/** Test-only helpers for auth session unit tests. */

export function buildTestJwt(expSeconds) {
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ exp: expSeconds }));
  return `${header}.${payload}.test-signature`;
}
