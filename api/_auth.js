import crypto from 'crypto';
import { logSecurityEvent } from './_security.js';
import { sendOtpNotification, maskEmail, maskPhone } from './_notify.js';

export const COOKIE_NAME = 'tallerya_admin';

// In-memory rate limiting and IP lockout tracker
const MAX_ATTEMPTS = 3;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 minutos de bloqueo

// Structure: ip -> { count: number, lockedUntil: number, lastAttempt: number }
const ipLockoutStore = new Map();

// 2FA Verification Code store: challengeId -> { code, user, ip, attempts, expiresAt }
const twoFactorStore = new Map();

// Clean up expired 2FA tokens periodically
setInterval(() => {
  const now = Date.now();
  for (const [id, item] of twoFactorStore.entries()) {
    if (item.expiresAt < now) {
      twoFactorStore.delete(id);
    }
  }
}, 60 * 1000);

export function getClientIp(req) {
  const forwarded = req.headers?.['x-forwarded-for'] || req.headers?.['x-real-ip'];
  if (forwarded) {
    return String(forwarded).split(',')[0].trim();
  }
  return req.socket?.remoteAddress || req.ip || '127.0.0.1';
}

export function getAllLockoutEntries() {
  const now = Date.now();
  const list = [];
  for (const [ip, entry] of ipLockoutStore.entries()) {
    const isLocked = Boolean(entry.lockedUntil && entry.lockedUntil > now);
    const remainingSeconds = isLocked ? Math.ceil((entry.lockedUntil - now) / 1000) : 0;
    list.push({
      ip,
      count: entry.count,
      isLocked,
      remainingSeconds,
      lastAttempt: entry.lastAttempt ? new Date(entry.lastAttempt).toISOString() : null
    });
  }
  return list;
}

export function unblockIp(ip) {
  if (ip && ipLockoutStore.has(ip)) {
    ipLockoutStore.delete(ip);
    logSecurityEvent('ADMIN_UNBLOCK_IP', { ip });
    return true;
  }
  return false;
}

export function checkIpStatus(ip) {
  const now = Date.now();
  const entry = ipLockoutStore.get(ip);
  if (!entry) {
    return { isLocked: false, attempts: 0, remainingAttempts: MAX_ATTEMPTS };
  }

  // If lockout expired, reset
  if (entry.lockedUntil && entry.lockedUntil > now) {
    const remainingSeconds = Math.ceil((entry.lockedUntil - now) / 1000);
    return {
      isLocked: true,
      attempts: entry.count,
      remainingAttempts: 0,
      remainingSeconds,
      remainingMinutes: Math.ceil(remainingSeconds / 60)
    };
  }

  // If window has passed without active lock, reset
  if (now - entry.lastAttempt > LOCKOUT_WINDOW_MS) {
    ipLockoutStore.delete(ip);
    return { isLocked: false, attempts: 0, remainingAttempts: MAX_ATTEMPTS };
  }

  return {
    isLocked: false,
    attempts: entry.count,
    remainingAttempts: Math.max(0, MAX_ATTEMPTS - entry.count)
  };
}

export function recordFailedAttempt(ip, user) {
  const now = Date.now();
  const entry = ipLockoutStore.get(ip) || { count: 0, lockedUntil: 0, lastAttempt: now };
  
  entry.count += 1;
  entry.lastAttempt = now;

  logSecurityEvent('ADMIN_LOGIN_FAIL', { ip, user, attempt: entry.count });

  if (entry.count >= MAX_ATTEMPTS) {
    entry.lockedUntil = now + LOCKOUT_WINDOW_MS;
    ipLockoutStore.set(ip, entry);
    logSecurityEvent('ADMIN_IP_LOCKED', { ip, user, durationMs: LOCKOUT_WINDOW_MS });
    const remainingSeconds = Math.ceil(LOCKOUT_WINDOW_MS / 1000);
    return {
      isLocked: true,
      attempts: entry.count,
      remainingAttempts: 0,
      remainingSeconds,
      remainingMinutes: Math.ceil(remainingSeconds / 60)
    };
  }

  ipLockoutStore.set(ip, entry);
  return {
    isLocked: false,
    attempts: entry.count,
    remainingAttempts: Math.max(0, MAX_ATTEMPTS - entry.count)
  };
}

export function recordSuccessfulLogin(ip, user) {
  ipLockoutStore.delete(ip);
  logSecurityEvent('ADMIN_LOGIN_SUCCESS', { ip, user });
}

function getSecret() {
  return process.env.ADMIN_TOKEN_SECRET || process.env.ADMIN_PIN || 'tallerya-secure-secret-key-2026';
}

export function makeToken() {
  const user = (process.env.ADMIN_USER || 'mecanicadakar@gmail.com').toLowerCase().trim();
  return crypto.createHmac('sha256', getSecret()).update(user).digest('hex');
}

/**
 * Constant-time string comparison using SHA256 hashes to prevent timing attacks
 */
function safeCompare(a, b) {
  const hashA = crypto.createHash('sha256').update(String(a || '')).digest();
  const hashB = crypto.createHash('sha256').update(String(b || '')).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

export function checkCredentials(user, pin) {
  const inputUser = String(user || '').toLowerCase().trim();
  const allowedAdmin = (process.env.ADMIN_USER || 'mecanicadakar@gmail.com').toLowerCase().trim();
  
  // Strict check on authorized email
  if (inputUser !== allowedAdmin && inputUser !== 'mecanicadakar@gmail.com') {
    return { ok: false, reason: 'unauthorized_admin' };
  }

  const expectedPin = process.env.ADMIN_PIN || '1234';
  if (!safeCompare(pin, expectedPin)) {
    return { ok: false, reason: 'mismatch' };
  }

  return { ok: true, reason: null };
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
  const token = makeToken();
  const authHeader = req.headers.authorization || req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ') && safeCompare(authHeader.slice(7).trim(), token)) {
    return true;
  }
  const cookies = parseCookies(req.headers.cookie);
  return Boolean(cookies[COOKIE_NAME]) && safeCompare(cookies[COOKIE_NAME], token);
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

/**
 * 2FA OTP Creation
 * Generates a secure random 6-digit verification code with 5-minute expiration
 * and dispatches it secretly to the authorized admin email/phone.
 */
export async function create2FAChallenge(user, ip) {
  // Generate random 6-digit integer formatted string (100000 - 999999)
  const code = String(crypto.randomInt(100000, 1000000));
  const challengeId = crypto.randomBytes(20).toString('hex');
  const expiresInMinutes = 5;
  const expiresAt = Date.now() + expiresInMinutes * 60 * 1000;

  twoFactorStore.set(challengeId, {
    code,
    user: String(user).toLowerCase().trim(),
    ip,
    attempts: 0,
    expiresAt
  });

  logSecurityEvent('ADMIN_2FA_CODE_GENERATED', { ip, user, challengeId: challengeId.slice(0, 8) + '...' });

  // Dispatch OTP code securely to authorized email/phone in background
  const dispatchResult = await sendOtpNotification({ user, code, expiresInMinutes, ip });

  return {
    challengeId,
    maskedEmail: dispatchResult.maskedEmail,
    maskedPhone: dispatchResult.maskedPhone,
    expiresInSeconds: expiresInMinutes * 60,
    emailSent: dispatchResult.emailSent,
    smsSent: dispatchResult.smsSent
  };
}

/**
 * 2FA OTP Verification
 */
export function verify2FAChallenge(challengeId, inputCode, ip) {
  if (!challengeId || !twoFactorStore.has(challengeId)) {
    return {
      ok: false,
      error: 'La clave de verificación ha expirado o no es válida. Por favor, reintenta.',
      expired: true
    };
  }

  const entry = twoFactorStore.get(challengeId);
  const now = Date.now();

  if (entry.expiresAt < now) {
    twoFactorStore.delete(challengeId);
    return {
      ok: false,
      error: 'La clave de verificación ha caducado (duración máxima 5 minutos). Solicitá una nueva.',
      expired: true
    };
  }

  entry.attempts += 1;
  const cleanInput = String(inputCode || '').trim();

  // Validate timing-safe code match
  if (!safeCompare(cleanInput, entry.code)) {
    if (entry.attempts >= 3) {
      twoFactorStore.delete(challengeId);
      logSecurityEvent('ADMIN_2FA_FAILED_EXHAUSTED', { ip, user: entry.user });
      return {
        ok: false,
        error: 'Has agotado los 3 intentos permitidos para este código de verificación. Por seguridad debés iniciar el proceso nuevamente.',
        expired: true
      };
    }
    const left = 3 - entry.attempts;
    logSecurityEvent('ADMIN_2FA_MISMATCH', { ip, user: entry.user, attempts: entry.attempts });
    return {
      ok: false,
      error: `Clave de verificación incorrecta. Te quedan ${left} de 3 intento(s).`,
      remainingAttempts: left,
      expired: false
    };
  }

  // Code is valid! Consume challenge
  twoFactorStore.delete(challengeId);
  logSecurityEvent('ADMIN_2FA_SUCCESS', { ip, user: entry.user });
  return {
    ok: true,
    user: entry.user
  };
}



