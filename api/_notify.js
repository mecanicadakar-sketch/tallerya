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
 * Plantilla HTML para el correo de verificación 2FA
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
 * Envío de notificaciones por Resend, Brevo, Webhook o registro en logs
 * 100% nativo sin dependencias externas pesadas para compatibilidad con Vercel.
 */
export async function sendOtpNotification({ user, code, expiresInMinutes = 5, ip }) {
  const targetEmail = getAuthorizedEmail();
  const targetPhone = getAuthorizedPhone();
  const maskedEmail = maskEmail(targetEmail);
  const maskedPhone = maskPhone(targetPhone);

  const timestamp = new Date().toLocaleString('es-PY', { timeZone: 'America/Asuncion' });

  // Registro de auditoría visible en los Logs de Vercel
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

  // 1. Envío vía Resend API (HTTP REST nativo)
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
        const errText = await resendRes.text();
        console.error('[sendOtpNotification Resend API Error HTTP ' + resendRes.status + ' ]:', errText);
      } else {
        console.log('[sendOtpNotification Resend Success]: Email enviado a', targetEmail);
        emailSent = true;
      }
    } catch (err) {
      console.error('[sendOtpNotification Resend Fetch Error]:', err.message);
    }
  }

  // 2. Envío vía Brevo API (HTTP REST nativo)
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

  // 3. Webhook para WhatsApp o SMS
  if (process.env.OTP_WEBHOOK_URL) {
    try {
      await fetch(process.env.OTP_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: '2fa_otp_generated',
          user,
          phone: targetPhone,
          email: targetEmail,
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

/**
 * Notificación al Administrador cuando un nuevo taller se postula
 */
export async function notifyAdminNewTaller({ taller, ip = '' }) {
  const targetEmail = getAuthorizedEmail();
  const timestamp = new Date().toLocaleString('es-PY', { timeZone: 'America/Asuncion' });

  console.log(`\n======================================================`);
  console.log(`[🏢 NUEVO TALLER POSTULADO]`);
  console.log(`Nombre: ${taller.nombre}`);
  console.log(`Ciudad: ${taller.ciudad} | WhatsApp: ${taller.whatsapp}`);
  console.log(`Categoría: ${taller.categoria}`);
  console.log(`Destacado Solicitado: ${taller.destacadoSolicitado ? 'SÍ ⭐' : 'No'}`);
  console.log(`Hora (PY): ${timestamp}`);
  console.log(`======================================================\n`);

  if (process.env.RESEND_API_KEY) {
    try {
      const fromAddress = process.env.RESEND_FROM || 'TallerYa <onboarding@resend.dev>';
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY.trim()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [targetEmail],
          subject: `🏢 ¡Nueva postulación de Taller! - ${taller.nombre} (${taller.ciudad})`,
          html: `
            <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;margin:0 auto;padding:24px;border:1px solid #E2E8F0;border-radius:14px;background:#fff;color:#1E293B;">
              <h2 style="color:#1E3A8A;margin:0 0 12px;font-size:20px;">🏢 Nueva Postulación de Taller en TallerYa</h2>
              <p style="font-size:14.5px;line-height:1.5;margin:0 0 16px;color:#334155;">
                Se ha registrado una nueva solicitud de taller mecánico pendiente de revisión y aprobación en el panel de administrador:
              </p>
              <div style="background:#F8FAFC;border:1px solid #CBD5E1;border-radius:10px;padding:16px;margin-bottom:18px;">
                <p style="margin:4px 0;"><b>Taller:</b> ${taller.nombre}</p>
                <p style="margin:4px 0;"><b>Ciudad:</b> ${taller.ciudad}</p>
                <p style="margin:4px 0;"><b>Dirección:</b> ${taller.direccion}</p>
                <p style="margin:4px 0;"><b>WhatsApp:</b> ${taller.whatsapp}</p>
                <p style="margin:4px 0;"><b>Categoría:</b> ${taller.categoria}</p>
                <p style="margin:4px 0;"><b>Destacado:</b> ${taller.destacadoSolicitado ? '⭐ Solicitó Destacado' : 'Estándar'}</p>
              </div>
              <p style="font-size:13px;color:#64748B;margin:0;">Ingresá al panel de administración para aprobar o rechazar esta solicitud.</p>
            </div>
          `
        })
      });
    } catch (e) {
      console.error('[notifyAdminNewTaller Error]:', e.message);
    }
  }

  if (process.env.NOTIF_WEBHOOK_URL || process.env.OTP_WEBHOOK_URL) {
    try {
      const webhookUrl = process.env.NOTIF_WEBHOOK_URL || process.env.OTP_WEBHOOK_URL;
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'nuevo_taller_postulado',
          taller,
          timestamp,
          ip
        })
      });
    } catch (e) {
      console.error('[notifyAdminNewTaller Webhook Error]:', e.message);
    }
  }
}

/**
 * Notificación al Administrador cuando se recibe una nueva opinión o queja
 */
export async function notifyAdminNewFeedback({ feedback, ip = '' }) {
  const targetEmail = getAuthorizedEmail();
  const timestamp = new Date().toLocaleString('es-PY', { timeZone: 'America/Asuncion' });

  console.log(`\n======================================================`);
  console.log(`[⭐ NUEVA OPINIÓN / VALORACIÓN RECIBIDA]`);
  console.log(`Cliente: ${feedback.clienteNombre}`);
  console.log(`Tipo: ${feedback.tipo} | Calificación: ${feedback.calificacion}★`);
  console.log(`Taller Destino: ${feedback.tallerNombre || 'General Plataforma'}`);
  console.log(`Mensaje: "${feedback.mensaje}"`);
  console.log(`Hora (PY): ${timestamp}`);
  console.log(`======================================================\n`);

  if (process.env.RESEND_API_KEY) {
    try {
      const fromAddress = process.env.RESEND_FROM || 'TallerYa <onboarding@resend.dev>';
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY.trim()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [targetEmail],
          subject: `⭐ Nueva Opinión (${feedback.calificacion}★) - ${feedback.clienteNombre}`,
          html: `
            <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;margin:0 auto;padding:24px;border:1px solid #E2E8F0;border-radius:14px;background:#fff;color:#1E293B;">
              <h2 style="color:#1E3A8A;margin:0 0 12px;font-size:20px;">⭐ Nueva Opinión Recibida</h2>
              <div style="background:#F8FAFC;border:1px solid #CBD5E1;border-radius:10px;padding:16px;margin-bottom:18px;">
                <p style="margin:4px 0;"><b>Cliente:</b> ${feedback.clienteNombre} (${feedback.clienteContacto || 'Sin contacto'})</p>
                <p style="margin:4px 0;"><b>Calificación:</b> ${'★'.repeat(feedback.calificacion || 5)} (${feedback.calificacion}/5)</p>
                <p style="margin:4px 0;"><b>Destino:</b> ${feedback.tallerNombre || 'Plataforma TallerYa'}</p>
                <p style="margin:4px 0;"><b>Título:</b> ${feedback.titulo || '-'}</p>
                <p style="margin:4px 0;"><b>Mensaje:</b> "${feedback.mensaje}"</p>
              </div>
              <p style="font-size:13px;color:#64748B;margin:0;">Ingresá al panel de administración para moderar esta opinión.</p>
            </div>
          `
        })
      });
    } catch (e) {
      console.error('[notifyAdminNewFeedback Error]:', e.message);
    }
  }

  if (process.env.NOTIF_WEBHOOK_URL || process.env.OTP_WEBHOOK_URL) {
    try {
      const webhookUrl = process.env.NOTIF_WEBHOOK_URL || process.env.OTP_WEBHOOK_URL;
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'nueva_opinion_recibida',
          feedback,
          timestamp,
          ip
        })
      });
    } catch (e) {
      console.error('[notifyAdminNewFeedback Webhook Error]:', e.message);
    }
  }
}

/**
 * Normaliza número de teléfono o WhatsApp a formato internacional estándar (ej: 595975635770)
 */
export function formatWhatsAppNumber(phone) {
  if (!phone) return '';
  let cleaned = String(phone).replace(/[^0-9+]/g, '');
  if (!cleaned) return '';
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }
  // Si empieza con 0 (ej. 0975123456 en Paraguay), reemplazar 0 por 595
  if (cleaned.startsWith('0') && cleaned.length >= 9) {
    cleaned = '595' + cleaned.substring(1);
  }
  // Si es de 9 dígitos y empieza con 9 (ej. 975123456), anteponer 595
  if (cleaned.length === 9 && cleaned.startsWith('9')) {
    cleaned = '595' + cleaned;
  }
  return cleaned;
}

/**
 * Genera el texto y enlace directo de WhatsApp para felicitar y notificar al postulante
 */
export function buildTallerAprobadoWhatsAppMsg({ nombre, ciudad, direccion, id, codigo, appUrl }) {
  const baseUrl = appUrl || process.env.PUBLIC_APP_URL || 'https://tallerya.com';
  const tallerUrl = `${baseUrl.replace(/\/$/, '')}/?taller=${id}`;
  
  const texto = 
`🎉 ¡Felicitaciones de parte de *TallerYa*! 🛠️🇵🇾

Estimado equipo de *${nombre}*, nos complace informarle que su postulación ha sido *APROBADA* y su taller ya se encuentra *ONLINE Y PUBLICADO* en nuestra plataforma para todos los conductores y usuarios de Paraguay.

📋 *Detalles de su Ficha:*
• *Taller:* ${nombre}
• *Ciudad:* ${ciudad || 'Paraguay'}
• *Dirección:* ${direccion || 'Ubicación verificada'}
${codigo ? `• *Código de Registro:* ${codigo}\n` : ''}
🔗 *Verifique su publicación en vivo y sus datos aquí:*
${tallerUrl}

✨ *Recomendación:* Ingrese al enlace para comprobar que sus números de teléfono, horarios, servicios y fotos se muestren correctamente.

¡Muchos éxitos y gracias por formar parte de la mayor red de talleres mecánicos de Paraguay! 🚗💨`;

  return {
    texto,
    tallerUrl
  };
}

/**
 * Notificación automática cuando un taller es APROBADO por el administrador
 */
export async function notifyTallerAprobado({ taller, appUrl = '' }) {
  const timestamp = new Date().toLocaleString('es-PY', { timeZone: 'America/Asuncion' });
  const waTarget = formatWhatsAppNumber(taller.whatsapp || taller.telefono);
  const targetEmail = taller.email && taller.email.includes('@') ? taller.email.trim() : null;
  const { texto, tallerUrl } = buildTallerAprobadoWhatsAppMsg({
    nombre: taller.nombre,
    ciudad: taller.ciudad,
    direccion: taller.direccion,
    id: taller.id,
    codigo: taller.codigo || ('TY-T-' + String(taller.folio || '').padStart(6, '0')),
    appUrl
  });

  const waLink = waTarget ? `https://wa.me/${waTarget}?text=${encodeURIComponent(texto)}` : null;

  console.log(`\n======================================================`);
  console.log(`[🚀 TALLER APROBADO Y ONLINE — AVISO AUTOMÁTICO]`);
  console.log(`Taller: ${taller.nombre} (ID: ${taller.id})`);
  console.log(`WhatsApp Postulante: ${taller.whatsapp} -> Formateado: ${waTarget || 'No disponible'}`);
  console.log(`Link WhatsApp: ${waLink || 'Sin número válido'}`);
  console.log(`URL Ficha: ${tallerUrl}`);
  console.log(`Hora (PY): ${timestamp}`);
  console.log(`======================================================\n`);

  let emailSent = false;
  let webhookSent = false;

  // 1. Envío de notificación por correo electrónico si el postulante registró email
  if (targetEmail && process.env.RESEND_API_KEY) {
    try {
      const fromAddress = process.env.RESEND_FROM || 'TallerYa <onboarding@resend.dev>';
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY.trim()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [targetEmail],
          subject: `🎉 ¡Tu taller "${taller.nombre}" ya está online y aprobado en TallerYa!`,
          html: `
            <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;margin:0 auto;padding:24px;border:1px solid #E2E8F0;border-radius:14px;background:#fff;color:#1E293B;">
              <div style="text-align:center;margin-bottom:20px;">
                <span style="font-size:32px;">🎉🛠️</span>
                <h2 style="color:#1E3A8A;margin:8px 0 4px;font-size:22px;">¡Tu taller ya está online en TallerYa!</h2>
                <p style="color:#64748B;font-size:14px;margin:0;">Tu postulación ha sido aprobada con éxito</p>
              </div>
              <p style="font-size:15px;line-height:1.6;margin:0 0 16px;color:#334155;">
                Hola, nos alegra informarte que <b>${taller.nombre}</b> fue aprobado por el equipo de moderación y ya está disponible en el mapa y buscador de TallerYa para todos los conductores.
              </p>
              <div style="background:#F8FAFC;border:1px solid #CBD5E1;border-radius:10px;padding:16px;margin-bottom:20px;">
                <p style="margin:4px 0;"><b>Taller:</b> ${taller.nombre}</p>
                <p style="margin:4px 0;"><b>Ciudad:</b> ${taller.ciudad}</p>
                <p style="margin:4px 0;"><b>Dirección:</b> ${taller.direccion}</p>
                <p style="margin:4px 0;"><b>WhatsApp de contacto:</b> ${taller.whatsapp}</p>
              </div>
              <div style="text-align:center;margin:24px 0;">
                <a href="${tallerUrl}" target="_blank" style="background:#2563EB;color:#FFFFFF;text-decoration:none;font-weight:700;font-size:15px;padding:12px 24px;border-radius:10px;display:inline-block;">
                  🔍 Verificar mi Taller Online
                </a>
              </div>
              <p style="font-size:13px;color:#64748B;margin:0;line-height:1.5;">
                Te recomendamos ingresar a tu ficha para verificar que todos los datos, horarios e imágenes sean correctos.
              </p>
            </div>
          `
        })
      });
      emailSent = true;
    } catch (err) {
      console.error('[notifyTallerAprobado Resend Error]:', err.message);
    }
  }

  // 2. Disparo de Webhook para Gateway de WhatsApp / SMS (Evolution API, Baileys, Z-API, Twilio, n8n, etc.)
  const webhookUrl = process.env.WHATSAPP_WEBHOOK_URL || process.env.NOTIF_WEBHOOK_URL || process.env.OTP_WEBHOOK_URL;
  if (webhookUrl && waTarget) {
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'taller_aprobado',
          tallerId: taller.id,
          tallerNombre: taller.nombre,
          phone: waTarget,
          rawPhone: taller.whatsapp || taller.telefono,
          message: texto,
          tallerUrl,
          timestamp
        })
      });
      webhookSent = true;
    } catch (err) {
      console.error('[notifyTallerAprobado Webhook Error]:', err.message);
    }
  }

  return {
    waTarget,
    waLink,
    tallerUrl,
    texto,
    emailSent,
    webhookSent
  };
}

