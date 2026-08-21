import { getSql, ensureSchema } from '../_db.js';
import { isAuthorized } from '../_auth.js';
import { getClientIp, checkRateLimit, sanitizeText } from '../_security.js';
import { notifyAdminNewTaller } from '../_notify.js';

function rowToTaller(r) {
  const imagenes = Array.isArray(r.imagenes) ? r.imagenes : [];
  return {
    id: r.id,
    nombre: r.nombre,
    categoria: r.categoria,
    ciudad: r.ciudad,
    direccion: r.direccion,
    horario: r.horario,
    descripcion: r.descripcion,
    servicios: r.servicios || [],
    telefono: r.telefono,
    whatsapp: r.whatsapp,
    email: r.email,
    imagen: r.imagen,
    imagenes: imagenes.length ? imagenes : (r.imagen ? [r.imagen] : []),
    ubicacion: r.lat != null && r.lng != null ? { lat: Number(r.lat), lng: Number(r.lng) } : null,
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
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  let sql;
  try {
    await ensureSchema();
    sql = getSql();
  } catch (e) {
    res.status(500).json({ error: 'Error de base de datos: ' + e.message });
    return;
  }

  if (req.method === 'GET') {
    const estado = req.query.estado;
    const authed = isAuthorized(req);

    if (estado) {
      if (estado !== 'aprobado' && !authed) {
        res.status(401).json({ error: 'No autorizado' });
        return;
      }
      const rows = await sql`SELECT * FROM talleres WHERE estado = ${estado} ORDER BY created_at DESC`;
      res.status(200).json(rows.map(rowToTaller));
      return;
    }

    if (req.query.all && authed) {
      const rows = await sql`SELECT * FROM talleres ORDER BY created_at DESC`;
      res.status(200).json(rows.map(rowToTaller));
      return;
    }

    const rows = await sql`SELECT * FROM talleres WHERE estado = 'aprobado' ORDER BY created_at DESC`;
    res.status(200).json(rows.map(rowToTaller));
    return;
  }

  if (req.method === 'POST') {
    const ip = getClientIp(req);
    // Rate limit public workshop registration (max 10 per 15 minutes per IP)
    const rateStatus = checkRateLimit('postular_taller', ip, 10, 15 * 60 * 1000);
    if (!rateStatus.allowed) {
      res.status(429).json({ error: 'Has enviado varias solicitudes recientemente. Por favor esperá unos minutos.' });
      return;
    }

    const b = req.body || {};
    // Honeypot check
    if (b.website_hp_check) {
      res.status(400).json({ error: 'Solicitud rechazada.' });
      return;
    }

    const nombre = sanitizeText(b.nombre, 120);
    const direccion = sanitizeText(b.direccion, 200);
    const ciudad = sanitizeText(b.ciudad, 100);
    const whatsapp = sanitizeText(b.whatsapp, 50);

    if (!nombre || !direccion || !ciudad || !whatsapp) {
      res.status(400).json({ error: 'Faltan campos obligatorios (nombre, dirección, ciudad, WhatsApp).' });
      return;
    }

    const id = 't' + Date.now() + Math.random().toString(36).slice(2, 7);
    const rawServicios = Array.isArray(b.servicios) ? b.servicios : [];
    const cleanServicios = rawServicios.map(s => sanitizeText(s, 60)).filter(Boolean);
    const servicios = JSON.stringify(cleanServicios);

    let lat = null;
    let lng = null;
    if (b.ubicacion && typeof b.ubicacion.lat === 'number' && typeof b.ubicacion.lng === 'number') {
      if (b.ubicacion.lat >= -90 && b.ubicacion.lat <= 90 && b.ubicacion.lng >= -180 && b.ubicacion.lng <= 180) {
        lat = b.ubicacion.lat;
        lng = b.ubicacion.lng;
      }
    }

    const imagenesArr = Array.isArray(b.imagenes) ? b.imagenes.filter(Boolean).slice(0, 5) : [];
    const cleanImagenes = imagenesArr.map(img => sanitizeText(img, 1500000));
    const imagenesJson = JSON.stringify(cleanImagenes);
    const primeraImagen = cleanImagenes[0] || sanitizeText(b.imagen, 1500000) || '';

    const usuarioLogin = sanitizeText(b.usuario || b.usuarioLogin || '', 100);
    const usuarioPass = String(b.password || b.usuarioPass || '').trim().slice(0, 100);
    const categoria = sanitizeText(b.categoria, 80);
    const horario = sanitizeText(b.horario, 120);
    const descripcion = sanitizeText(b.descripcion, 2000);
    const telefono = sanitizeText(b.telefono, 50);
    const email = sanitizeText(b.email, 120);
    const telefonoPago = sanitizeText(b.telefonoPago, 50);

    const inserted = await sql`
      INSERT INTO talleres (id, nombre, categoria, ciudad, direccion, horario, descripcion, servicios, telefono, whatsapp, email, imagen, imagenes, lat, lng, estado, destacado, destacado_solicitado, auspicio_solicitado, telefono_pago, usuario_login, usuario_pass)
      VALUES (${id}, ${nombre}, ${categoria}, ${ciudad}, ${direccion}, ${horario}, ${descripcion}, ${servicios}::jsonb, ${telefono}, ${whatsapp}, ${email}, ${primeraImagen}, ${imagenesJson}::jsonb, ${lat}, ${lng}, 'pendiente', false, ${Boolean(b.destacadoSolicitado)}, ${Boolean(b.auspicioSolicitado)}, ${telefonoPago}, ${usuarioLogin}, ${usuarioPass})
      RETURNING folio
    `;
    const codigo = 'TY-T-' + String(inserted[0].folio).padStart(6, '0');

    // Notify administrator asynchronously
    notifyAdminNewTaller({
      taller: {
        id,
        nombre,
        categoria,
        ciudad,
        direccion,
        whatsapp,
        telefono,
        email,
        destacadoSolicitado: Boolean(b.destacadoSolicitado),
        auspicioSolicitado: Boolean(b.auspicioSolicitado)
      },
      ip
    }).catch(err => console.error('[notifyAdminNewTaller Async Error]:', err));

    res.status(201).json({ ok: true, id, codigo });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
