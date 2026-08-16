import { 
  checkCredentials, 
  setAuthCookie, 
  makeToken, 
  getClientIp, 
  checkIpStatus, 
  recordFailedAttempt, 
  recordSuccessfulLogin, 
  isAuthorized, 
  getAllLockoutEntries, 
  unblockIp,
  create2FAChallenge,
  verify2FAChallenge
} from './_auth.js';
import { getSecurityAuditLogs, sanitizeText } from './_security.js';

export default async function handler(req, res) {
  const ip = getClientIp(req);

  // Status check for UI or admin security audit
  if (req.method === 'GET') {
    if (req.query.audit && isAuthorized(req)) {
      res.status(200).json({
        ok: true,
        auditLogs: getSecurityAuditLogs(),
        lockouts: getAllLockoutEntries()
      });
      return;
    }
    const status = checkIpStatus(ip);
    res.status(200).json({ ok: true, ipStatus: status });
    return;
  }

  // Admin security actions (e.g. unblock IP)
  if (req.method === 'PATCH' || (req.method === 'POST' && req.body && req.body.action === 'unblock_ip')) {
    if (!isAuthorized(req)) {
      res.status(401).json({ error: 'No autorizado' });
      return;
    }
    const targetIp = sanitizeText(req.body?.targetIp || req.query?.targetIp);
    const unblocked = unblockIp(targetIp);
    res.status(200).json({ ok: true, unblocked, targetIp });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // 1. Check if the IP is already locked out
  const ipStatus = checkIpStatus(ip);
  if (ipStatus.isLocked) {
    const mins = ipStatus.remainingMinutes || 15;
    res.status(429).json({
      ok: false,
      isLocked: true,
      remainingSeconds: ipStatus.remainingSeconds,
      remainingMinutes: mins,
      error: `🚫 Acceso bloqueado por seguridad: Se superó el límite de 3 intentos fallidos desde tu dirección IP. Intentá nuevamente en ${mins} minuto(s).`
    });
    return;
  }

  const { action, challengeId, code, user, pin } = req.body || {};

  // STEP 2: Verify 2FA verification code
  if (action === 'verify_2fa' || (challengeId && code)) {
    const cleanChallengeId = String(challengeId || '').trim();
    const cleanCode = String(code || '').trim();

    const result2FA = verify2FAChallenge(cleanChallengeId, cleanCode, ip);

    if (!result2FA.ok) {
      if (result2FA.expired) {
        res.status(400).json({
          ok: false,
          error: result2FA.error,
          expired: true
        });
        return;
      }

      res.status(401).json({
        ok: false,
        error: result2FA.error,
        remainingAttempts: result2FA.remainingAttempts,
        expired: false
      });
      return;
    }

    // 2FA succeeded! Grant session
    recordSuccessfulLogin(ip, result2FA.user);
    setAuthCookie(res);
    res.status(200).json({
      ok: true,
      token: makeToken(),
      user: result2FA.user,
      message: '✅ Verificación de doble factor completada con éxito.'
    });
    return;
  }

  // STEP 1: Verify username and password/PIN, then issue 2FA OTP
  const cleanUser = sanitizeText(user, 100);
  const cleanPin = String(pin || '').trim();
  const result = checkCredentials(cleanUser, cleanPin);

  // Invalid credentials -> record failed attempt
  if (!result.ok) {
    const attemptInfo = recordFailedAttempt(ip, cleanUser);

    if (attemptInfo.isLocked) {
      const mins = attemptInfo.remainingMinutes || 15;
      res.status(429).json({
        ok: false,
        isLocked: true,
        remainingSeconds: attemptInfo.remainingSeconds,
        remainingMinutes: mins,
        error: `🚫 IP Bloqueada temporalmente: Has alcanzado el límite máximo de 3 intentos fallidos. Por seguridad, el acceso desde esta IP ha sido suspendido por ${mins} minutos.`
      });
      return;
    }

    const remaining = attemptInfo.remainingAttempts;
    let baseMsg = 'Usuario o PIN incorrecto.';
    if (result.reason === 'unauthorized_admin') {
      baseMsg = 'Acceso denegado: Únicamente la cuenta autorizada tiene acceso como administrador.';
    } else if (result.reason === 'mismatch') {
      baseMsg = 'Contraseña o PIN incorrecto.';
    }

    const warningMsg = `${baseMsg} Te quedan ${remaining} de 3 intentos antes de que tu IP sea bloqueada por 15 minutos.`;

    res.status(401).json({
      ok: false,
      error: warningMsg,
      reason: result.reason,
      remainingAttempts: remaining,
      attempts: attemptInfo.attempts,
      isLocked: false
    });
    return;
  }

  // Step 1 Success -> Generate and secretly dispatch 2FA verification challenge to authorized email/phone
  const challenge = await create2FAChallenge(cleanUser, ip);

  res.status(200).json({
    ok: true,
    requires2FA: true,
    step: '2fa_required',
    challengeId: challenge.challengeId,
    maskedEmail: challenge.maskedEmail,
    maskedPhone: challenge.maskedPhone,
    expiresInSeconds: challenge.expiresInSeconds,
    message: `Hemos enviado una clave de verificación de 6 dígitos a tu correo autorizado (${challenge.maskedEmail}) y celular/WhatsApp (${challenge.maskedPhone}).`
  });
}



