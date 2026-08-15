import crypto from 'crypto';

// ==========================================
// TALLERYA DEFENSIVE WAF & SECURITY ENGINE
// ==========================================

// Audit logs of security events (in-memory circular buffer)
const MAX_AUDIT_LOGS = 100;
const auditLogs = [];

export function logSecurityEvent(type, details = {}) {
  const entry = {
    id: 'sec_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    type,
    timestamp: new Date().toISOString(),
    ...details
  };
  auditLogs.unshift(entry);
  if (auditLogs.length > MAX_AUDIT_LOGS) {
    auditLogs.pop();
  }
}

export function getSecurityAuditLogs() {
  return [...auditLogs];
}

// ------------------------------------------
// IP Extraction & Normalization
// ------------------------------------------
export function getClientIp(req) {
  const forwarded = req.headers?.['x-forwarded-for'] || req.headers?.['x-real-ip'];
  if (forwarded) {
    return String(forwarded).split(',')[0].trim();
  }
  return req.socket?.remoteAddress || req.ip || '127.0.0.1';
}

// ------------------------------------------
// Rate Limiter Memory Store
// ------------------------------------------
const rateLimitStores = new Map();

function getRateLimiter(bucketName) {
  if (!rateLimitStores.has(bucketName)) {
    rateLimitStores.set(bucketName, new Map());
  }
  return rateLimitStores.get(bucketName);
}

/**
 * Generic Rate Limiting Check
 * @param {string} bucket - Category (e.g. 'global', 'mechanic_login', 'ai', 'submissions')
 * @param {string} key - Identifier (usually IP address)
 * @param {number} max - Maximum requests allowed in window
 * @param {number} windowMs - Window duration in ms
 */
export function checkRateLimit(bucket, key, max, windowMs) {
  const store = getRateLimiter(bucket);
  const now = Date.now();
  const entry = store.get(key) || { count: 0, resetAt: now + windowMs };

  // If window expired, reset
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + windowMs;
  }

  entry.count += 1;
  store.set(key, entry);

  const isExceeded = entry.count > max;
  const remaining = Math.max(0, max - entry.count);
  const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);

  if (isExceeded && entry.count === max + 1) {
    logSecurityEvent('RATE_LIMIT_EXCEEDED', { bucket, key, max, windowMs });
  }

  return {
    allowed: !isExceeded,
    count: entry.count,
    remaining,
    retryAfterSeconds
  };
}

// ------------------------------------------
// Mechanic Login Protection Store
// ------------------------------------------
const mechanicLoginStore = new Map();
const MAX_MECANICO_ATTEMPTS = 5;
const MECANICO_LOCKOUT_MS = 10 * 60 * 1000; // 10 minutes

export function checkMechanicIpStatus(ip) {
  const now = Date.now();
  const entry = mechanicLoginStore.get(ip);
  if (!entry) return { isLocked: false, remainingAttempts: MAX_MECANICO_ATTEMPTS };

  if (entry.lockedUntil && entry.lockedUntil > now) {
    const remainingSeconds = Math.ceil((entry.lockedUntil - now) / 1000);
    return {
      isLocked: true,
      remainingSeconds,
      remainingMinutes: Math.ceil(remainingSeconds / 60)
    };
  }

  if (now - entry.lastAttempt > MECANICO_LOCKOUT_MS) {
    mechanicLoginStore.delete(ip);
    return { isLocked: false, remainingAttempts: MAX_MECANICO_ATTEMPTS };
  }

  return {
    isLocked: false,
    remainingAttempts: Math.max(0, MAX_MECANICO_ATTEMPTS - entry.count)
  };
}

export function recordFailedMechanicLogin(ip, usuario) {
  const now = Date.now();
  const entry = mechanicLoginStore.get(ip) || { count: 0, lockedUntil: 0, lastAttempt: now };
  entry.count += 1;
  entry.lastAttempt = now;

  logSecurityEvent('MECANICO_LOGIN_FAIL', { ip, usuario, attempt: entry.count });

  if (entry.count >= MAX_MECANICO_ATTEMPTS) {
    entry.lockedUntil = now + MECANICO_LOCKOUT_MS;
    mechanicLoginStore.set(ip, entry);
    logSecurityEvent('MECANICO_IP_LOCKED', { ip, usuario });
    const remainingSeconds = Math.ceil(MECANICO_LOCKOUT_MS / 1000);
    return {
      isLocked: true,
      remainingSeconds,
      remainingMinutes: Math.ceil(remainingSeconds / 60)
    };
  }

  mechanicLoginStore.set(ip, entry);
  return {
    isLocked: false,
    remainingAttempts: Math.max(0, MAX_MECANICO_ATTEMPTS - entry.count)
  };
}

export function recordSuccessfulMechanicLogin(ip) {
  mechanicLoginStore.delete(ip);
}

// ------------------------------------------
// Input Sanitization & Anti-XSS Engine
// ------------------------------------------
const DANGEROUS_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /javascript\s*:/gi,
  /vbscript\s*:/gi,
  /data\s*:\s*text\/html/gi,
  /on\w+\s*=\s*(['"]).*?\1/gi,
  /on\w+\s*=\s*[^>\s]+/gi
];

export function sanitizeText(input, maxLength = 2000) {
  if (input === null || input === undefined) return '';
  let str = String(input).trim();
  
  // Truncate to maximum acceptable length
  if (str.length > maxLength) {
    str = str.slice(0, maxLength);
  }

  // Remove dangerous HTML execution vectors
  for (const pattern of DANGEROUS_PATTERNS) {
    str = str.replace(pattern, '');
  }

  // Remove null bytes
  str = str.replace(/\0/g, '');

  return str;
}

export function sanitizeObject(obj, maxStringLength = 2000) {
  if (!obj || typeof obj !== 'object') {
    if (typeof obj === 'string') return sanitizeText(obj, maxStringLength);
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, maxStringLength));
  }

  const cleaned = {};
  for (const [key, value] of Object.entries(obj)) {
    // Sanitize property key and value
    const cleanKey = sanitizeText(key, 100);
    cleaned[cleanKey] = sanitizeObject(value, maxStringLength);
  }
  return cleaned;
}

// ------------------------------------------
// Anti-CSRF Origin / Referer Validation
// ------------------------------------------
export function isValidOrigin(req) {
  const origin = req.headers?.origin || req.headers?.referer;
  if (!origin) return true; // Direct non-browser calls or same-origin without header

  const host = req.headers?.host;
  if (!host) return true;

  try {
    const parsedOrigin = new URL(origin);
    // Allow same host or local preview environment
    if (parsedOrigin.host === host) return true;
    if (parsedOrigin.hostname === 'localhost' || parsedOrigin.hostname === '127.0.0.1') return true;
    if (parsedOrigin.hostname.endsWith('.run.app') || parsedOrigin.hostname.endsWith('.google.com')) return true;
    return false;
  } catch (e) {
    return false;
  }
}
