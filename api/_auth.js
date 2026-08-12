import crypto from 'crypto';

export const COOKIE_NAME = 'tallerya_admin';

function getSecret() {
  return process.env.ADMIN_TOKEN_SECRET || process.env.ADMIN_PIN || 'change-me-please';
}

export function makeToken() {
  const user = process.env.ADMIN_USER || '';
  return crypto.createHmac('sha256', getSecret()).update(user).digest('hex');
}

export function checkCredentials(user, pin) {
  if (!process.env.ADMIN_USER || !process.env.ADMIN_PIN) return { ok: false, reason: 'no-config' };
  const ok = user === process.env.ADMIN_USER && pin === process.env.ADMIN_PIN;
  return { ok, reason: ok ? null : 'mismatch' };
}

function parseCookies(header) {
  const out = {};
  (header || '').split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx > -1) {
      const k = pair.slice(0, idx).trim();
      const v = pair.slice(idx + 1).trim();
      out[k] = decodeURIComponent(v);
    }
  });
  return out;
}

export function isAuthorized(req) {
  const cookies = parseCookies(req.headers.cookie);
  return Boolean(cookies[COOKIE_NAME]) && cookies[COOKIE_NAME] === makeToken();
}

export function setAuthCookie(res) {
  const token = makeToken();
  const secure = process.env.VERCEL ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${token}; HttpOnly; Path=/; Max-Age=${60 * 60 * 24 * 7}; SameSite=Lax${secure}`
  );
}

export function clearAuthCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
}
