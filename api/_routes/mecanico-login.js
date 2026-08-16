import { getSql, ensureSchema } from '../_db.js';
import { getClientIp, checkMechanicIpStatus, recordFailedMechanicLogin, recordSuccessfulMechanicLogin, sanitizeText } from '../_security.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const ip = getClientIp(req);
  const ipStatus = checkMechanicIpStatus(ip);
  if (ipStatus.isLocked) {
    const mins = ipStatus.remainingMinutes || 10;
    res.status(429).json({
      ok: false,
      isLocked: true,
      error: `🚫 Acceso suspendido temporalmente por seguridad. Se superó el límite de intentos fallidos. Por favor, intentá nuevamente en ${mins} minuto(s).`
    });
    return;
  }

  let sql;
  try {
    await ensureSchema();
    sql = getSql();
  } catch (e) {
    res.status(500).json({ error: 'Error de base de datos: ' + e.message });
    return;
  }

  const { usuario, password } = req.body || {};
  const userClean = sanitizeText(usuario, 120).toLowerCase();
  const passClean = String(password || '').trim();

  if (!userClean || !passClean) {
    res.status(400).json({ ok: false, error: 'Ingresá tu usuario/email y contraseña.' });
    return;
  }

  try {
    const rows = await sql`
      SELECT * FROM talleres 
      WHERE (LOWER(usuario_login) = ${userClean} OR LOWER(email) = ${userClean})
        AND usuario_pass = ${passClean}
      ORDER BY created_at DESC
      LIMIT 1
    `;

    if (rows.length === 0) {
      const attemptInfo = recordFailedMechanicLogin(ip, userClean);
      if (attemptInfo.isLocked) {
        res.status(429).json({
          ok: false,
          isLocked: true,
          error: '🚫 Has superado el límite de intentos fallidos. Tu acceso ha sido bloqueado temporalmente por 10 minutos por seguridad.'
        });
        return;
      }
      res.status(401).json({
        ok: false,
        error: `Usuario o contraseña incorrectos. Te quedan ${attemptInfo.remainingAttempts} intentos antes del bloqueo temporal.`
      });
      return;
    }

    // Success
    recordSuccessfulMechanicLogin(ip);

    const r = rows[0];
    let servicios = [];
    try {
      servicios = typeof r.servicios === 'string' ? JSON.parse(r.servicios) : (r.servicios || []);
    } catch (e) {
      servicios = [];
    }

    let imagenes = [];
    try {
      imagenes = typeof r.imagenes === 'string' ? JSON.parse(r.imagenes) : (r.imagenes || []);
    } catch (e) {
      imagenes = [];
    }

    const taller = {
      id: r.id,
      nombre: r.nombre,
      categoria: r.categoria,
      ciudad: r.ciudad,
      direccion: r.direccion,
      horario: r.horario,
      descripcion: r.descripcion,
      servicios,
      telefono: r.telefono,
      whatsapp: r.whatsapp,
      email: r.email,
      imagen: r.imagen,
      imagenes,
      ubicacion: (r.lat && r.lng) ? { lat: Number(r.lat), lng: Number(r.lng) } : null,
      estado: r.estado,
      destacado: r.destacado,
      destacadoSolicitado: r.destacado_solicitado,
      auspicioSolicitado: r.auspicio_solicitado,
      telefonoPago: r.telefono_pago,
      usuarioLogin: r.usuario_login || '',
      clics: Number(r.clics || 0),
      creado: r.created_at,
      codigo: 'TY-T-' + String(r.folio).padStart(6, '0')
    };

    res.status(200).json({ ok: true, taller });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Error al iniciar sesión: ' + err.message });
  }
}
