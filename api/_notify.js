import https from 'https';

export function getAuthorizedEmail() {
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_EMAIL.includes('@')) {
    return process.env.ADMIN_EMAIL.trim();
  }
  if (process.env.ADMIN_USER && process.env.ADMIN_USER.includes('@')) {
    return process.env.ADMIN_USER.trim();
  }
  return 'mecanicadakar@gmail.com';
}

export function getAuthorizedPhone() {
  return process.env.ADMIN_PHONE ? process.env.ADMIN_PHONE.trim() : '+595975635770';
}

/**
 * Mask destination email: mecanicadakar@gmail.com -> m*****r@gmail.com
 */
export function maskEmail(email = getAuthorizedEmail()) {
  const parts = String(email).split('@');
  if (parts.length !== 2) return email;
  const name = parts[0];
  const domain = parts[1];
  if (name.length <= 2) return name[0] + '*@' + domain;
  return name[0] + '*'.repeat(Math.max(3, name.length - 2)) + name[name.length - 1] + '@' + domain;
}

/**
 * Mask destination phone: +595975635770 -> +595 ••• ••5770
 */
export function maskPhone(phone = getAuthorizedPhone()) {
  const clean = String(phone).replace(/\s+/g, '');
  if (clean.length <= 4) return clean;
  const last4 = clean.slice(-4);
  const prefix = clean.slice(0, 4);
  return `${prefix} ••• ••${last4}`;
}

/**
 * Sends notification via Resend or Webhook if configured in environment,
 * or logs to security audit pipeline.
 */
export async function sendOtpNotification({ user, code, expiresInMinutes = 5, ip }) {
  const targetEmail = getAuthorizedEmail();
  const targetPhone = getAuthorizedPhone();
  const maskedEmail = maskEmail(targetEmail);
  const maskedPhone = maskPhone(targetPhone);

  const timestamp = new Date().toLocaleString('es-PY', { timeZone: 'America/Asuncion' });

  console.log(`\n======================================================`);
  console.log(`[🔐 TALLERYA 2FA DISPATCH]`);
  console.log(`Para: ${targetEmail} | Tel/WhatsApp: ${targetPhone}`);
  console.log(`Código de Verificación: ${code}`);
  console.log(`Válido por: ${expiresInMinutes} minutos`);
  console.log(`IP Solicitante: ${ip}`);
  console.log(`Hora (PY): ${timestamp}`);
  console.log(`======================================================\n`);

  let emailSent = false;
  let smsSent = false;

  // 1. Resend API support if RESEND_API_KEY is defined
  if (process.env.RESEND_API_KEY) {
    try {
      const fromAddress = process.env.RESEND_FROM || 'TallerYa <onboarding@resend.dev>';
      const resendPayload = JSON.stringify({
        from: fromAddress,
        to: [targetEmail],
        subject: `🔑 ${code} es tu clave de verificación de Administrador - TallerYa`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #E2E8F0; border-radius: 12px; background: #FFFFFF;">
            <div style="text-align: center; margin-bottom: 20px;">
              <h2 style="color: #1E3A8A; margin: 0;">TallerYa • Verificación de Seguridad</h2>
              <p style="color: #64748B; font-size: 14px; margin: 4px 0 0;">Panel de Administración</p>
            </div>
            <p style="font-size: 15px; color: #334155; line-height: 1.5;">
              Hola, se ha detectado una solicitud de inicio de sesión como Administrador en <b>TallerYa</b> desde la dirección IP <code>${ip}</code>.
            </p>
            <div style="background: #EFF6FF; border: 2px dashed #3B82F6; border-radius: 10px; padding: 18px; text-align: center; margin: 24px 0;">
              <span style="font-size: 13px; font-weight: 700; color: #1E40AF; text-transform: uppercase; letter-spacing: 1px;">Tu Clave de Verificación</span>
              <div style="font-size: 32px; font-weight: 900; letter-spacing: 8px; color: #1D4ED8; margin-top: 8px; font-family: monospace;">
                ${code}
              </div>
            </div>
            <p style="font-size: 13px; color: #64748B; line-height: 1.4;">
              ⏱️ Esta clave es de un solo uso y expirará en <b>${expiresInMinutes} minutos</b>.<br>
              🔒 <b>No compartas esta clave con nadie</b>. Si no fuiste vos quien solicitó este acceso, tu contraseña puede haber sido comprometida.
            </p>
          </div>
        `
      });

      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY.trim()}`,
          'Content-Type': 'application/json'
        },
        body: resendPayload
      });

      if (!resendRes.ok) {
        const errData = await resendRes.text();
        console.error('[sendOtpNotification Resend API Error HTTP', resendRes.status, ']:', errData);
      } else {
        const okData = await resendRes.json();
        console.log('[sendOtpNotification Resend Success]: Email enviado exitosamente, ID:', okData.id);
        emailSent = true;
      }
    } catch (err) {
      console.error('[sendOtpNotification Resend Error]:', err.message);
    }
  }

  // 2. Custom Webhook for WhatsApp / SMS notification (e.g. n8n, Twilio, Evolution API, UltraMsg)
  if (process.env.OTP_WEBHOOK_URL) {
    try {
      await fetch(process.env.OTP_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app: 'TallerYa',
          type: '2fa_otp',
          toEmail: targetEmail,
          toPhone: targetPhone,
          code,
          expiresInMinutes,
          ip,
          text: `[TallerYa] Tu clave de verificación de Administrador es: ${code}. Válida por ${expiresInMinutes} min. No la compartas.`
        })
      });
      smsSent = true;
    } catch (err) {
      console.error('[sendOtpNotification Webhook Error]:', err.message);
    }
  }

  return {
    targetEmail,
    targetPhone,
    maskedEmail,
    maskedPhone,
    emailSent,
    smsSent
  };
}
