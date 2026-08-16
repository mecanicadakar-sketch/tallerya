import https from 'https';
import nodemailer from 'nodemailer';

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
 * Creates formatted HTML email template for 2FA verification
 */
function getEmailHtml({ code, expiresInMinutes, ip, targetEmail }) {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 28px; border: 1px solid #E2E8F0; border-radius: 16px; background: #FFFFFF; color: #1E293B;">
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="display: inline-block; background: #1E3A8A; color: #FFFFFF; padding: 8px 16px; border-radius: 8px; font-weight: 800; font-size: 18px; letter-spacing: 0.5px;">
          🛠️ TallerYa
        </div>
        <h2 style="color: #0F172A; margin: 16px 0 4px; font-size: 22px;">Clave de Verificación de Administrador</h2>
        <p style="color: #64748B; font-size: 14px; margin: 0;">Panel de Control y Gestión</p>
      </div>

      <p style="font-size: 15px; line-height: 1.6; margin: 0 0 16px; color: #334155;">
        Hola, se ha registrado una solicitud de inicio de sesión en tu cuenta de <b>TallerYa</b> (${targetEmail}).
      </p>

      <div style="background: #F8FAFC; border: 2px dashed #2563EB; border-radius: 12px; padding: 22px; text-align: center; margin: 20px 0;">
        <div style="font-size: 12px; font-weight: 700; color: #1D4ED8; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 8px;">
          Tu Clave de Acceso Temporal (2FA)
        </div>
        <div style="font-size: 36px; font-weight: 900; letter-spacing: 10px; color: #1E40AF; font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;">
          ${code}
        </div>
      </div>

      <div style="background: #FEF3C7; border-left: 4px solid #F59E0B; padding: 12px 16px; border-radius: 6px; margin-bottom: 20px;">
        <p style="font-size: 13px; color: #92400E; margin: 0; line-height: 1.5;">
          ⏱️ <b>Vigencia:</b> Esta clave es válida únicamente durante <b>${expiresInMinutes} minutos</b>. No compartas esta clave con nadie.
        </p>
      </div>

      <div style="font-size: 12px; color: #94A3B8; border-top: 1px solid #F1F5F9; padding-top: 16px; line-height: 1.5;">
        <b>Detalles de la solicitud:</b><br>
        • IP de origen: <code>${ip}</code><br>
        • Fecha y hora: ${new Date().toLocaleString('es-PY', { timeZone: 'America/Asuncion' })} (Hora Paraguay)<br>
        Si no realizaste este intento, recomendamos cambiar tu PIN inmediatamente.
      </div>
    </div>
  `;
}

/**
 * Sends notification via Gmail/SMTP, Resend, Brevo or Webhook
 */
export async function sendOtpNotification({ user, code, expiresInMinutes = 5, ip }) {
  const targetEmail = getAuthorizedEmail();
  const targetPhone = getAuthorizedPhone();
  const maskedEmail = maskEmail(targetEmail);
  const maskedPhone = maskPhone(targetPhone);

  const timestamp = new Date().toLocaleString('es-PY', { timeZone: 'America/Asuncion' });

  // Security audit log (always logged to Vercel / Server console)
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

  const emailHtml = getEmailHtml({ code, expiresInMinutes, ip, targetEmail });
  const emailSubject = `🔑 ${code} es tu clave de verificación de Administrador - TallerYa`;

  // 1. GMAIL / SMTP via Nodemailer (GMAIL_USER + GMAIL_APP_PASSWORD o SMTP_HOST)
  if ((process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) || (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)) {
    try {
      let transporter;
      if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
        transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: process.env.GMAIL_USER.trim(),
            pass: process.env.GMAIL_APP_PASSWORD.trim().replace(/\s+/g, '')
          }
        });
      } else {
        transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST.trim(),
          port: Number(process.env.SMTP_PORT || 465),
          secure: Number(process.env.SMTP_PORT || 465) === 465,
          auth: {
            user: process.env.SMTP_USER.trim(),
            pass: process.env.SMTP_PASS.trim()
          }
        });
      }

      const senderEmail = process.env.GMAIL_USER || process.env.SMTP_USER;
      await transporter.sendMail({
        from: `"TallerYa Seguridad" <${senderEmail}>`,
        to: targetEmail,
        subject: emailSubject,
        html: emailHtml
      });

      console.log('[sendOtpNotification SMTP Success]: Email enviado vía SMTP a', targetEmail);
      emailSent = true;
    } catch (smtpErr) {
      console.error('[sendOtpNotification SMTP Error]:', smtpErr.message);
    }
  }

  // 2. Resend API support if RESEND_API_KEY is defined
  if (!emailSent && process.env.RESEND_API_KEY) {
    try {
      const fromAddress = process.env.RESEND_FROM || 'TallerYa <onboarding@resend.dev>';
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY.trim()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [targetEmail],
          subject: emailSubject,
          html: emailHtml
        })
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

  // 3. Brevo (Sendinblue) API support if BREVO_API_KEY is defined
  if (!emailSent && process.env.BREVO_API_KEY) {
    try {
      const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': process.env.BREVO_API_KEY.trim(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sender: { name: 'TallerYa', email: process.env.BREVO_SENDER || targetEmail },
          to: [{ email: targetEmail }],
          subject: emailSubject,
          htmlContent: emailHtml
        })
      });

      if (brevoRes.ok) {
        console.log('[sendOtpNotification Brevo Success]: Email enviado vía Brevo');
        emailSent = true;
      } else {
        console.error('[sendOtpNotification Brevo Error HTTP', brevoRes.status, ']:', await brevoRes.text());
      }
    } catch (err) {
      console.error('[sendOtpNotification Brevo Error]:', err.message);
    }
  }

  // 4. Custom Webhook for WhatsApp / SMS notification (e.g. n8n, Twilio, Evolution API, UltraMsg)
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

