import { getSql, ensureSchema } from '../_db.js';
import { isAuthorized } from '../_auth.js';
import { sanitizeText } from '../_security.js';

function rowToAuspicio(r) {
  return {
    id: r.id,
    nombre: r.nombre,
    categoria: r.categoria,
    horario: r.horario,
    descripcion: r.descripcion,
    servicios: r.servicios || [],
    direccion: r.direccion,
    ciudad: r.ciudad,
    telefono: r.telefono,
    whatsapp: r.whatsapp,
    email: r.email,
    imagen: r.imagen,
    link: r.link,
    ubicacion: r.lat != null && r.lng != null ? { lat: Number(r.lat), lng: Number(r.lng) } : null,
    destacado: r.destacado,
    destacadoSolicitado: r.destacado_solicitado,
    telefonoPago: r.telefono_pago,
    creado: r.created_at,
    codigo: 'TY-A-' + String(r.folio).padStart(6, '0')
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
    const rows = await sql`SELECT * FROM auspicios ORDER BY created_at DESC`;
    res.status(200).json(rows.map(rowToAuspicio));
    return;
  }

  if (req.method === 'POST') {
    if (!isAuthorized(req)) {
      res.status(401).json({ error: 'No autorizado' });
      return;
    }
    const b = req.body || {};
    const nombre = sanitizeText(b.nombre, 120);
    if (!nombre) {
      res.status(400).json({ error: 'Falta el nombre del auspicio.' });
      return;
    }
    const id = 's' + Date.now() + Math.random().toString(36).slice(2, 7);
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

    const destacadoVal = b.destacado !== undefined ? Boolean(b.destacado) : Boolean(b.destacadoSolicitado);
    const categoria = sanitizeText(b.categoria, 80);
    const horario = sanitizeText(b.horario, 120);
    const descripcion = sanitizeText(b.descripcion, 2000);
    const direccion = sanitizeText(b.direccion, 200);
    const ciudad = sanitizeText(b.ciudad, 100);
    const telefono = sanitizeText(b.telefono, 50);
    const whatsapp = sanitizeText(b.whatsapp, 50);
    const email = sanitizeText(b.email, 120);
    const imagen = sanitizeText(b.imagen, 1500000);
    const link = sanitizeText(b.link, 300);
    const telefonoPago = sanitizeText(b.telefonoPago, 50);

    const inserted = await sql`
      INSERT INTO auspicios (id, nombre, categoria, horario, descripcion, servicios, direccion, ciudad, telefono, whatsapp, email, imagen, link, lat, lng, destacado, destacado_solicitado, telefono_pago)
      VALUES (${id}, ${nombre}, ${categoria}, ${horario}, ${descripcion}, ${servicios}::jsonb, ${direccion}, ${ciudad}, ${telefono}, ${whatsapp}, ${email}, ${imagen}, ${link}, ${lat}, ${lng}, ${destacadoVal}, ${Boolean(b.destacadoSolicitado)}, ${telefonoPago})
      RETURNING folio
    `;
    const codigo = 'TY-A-' + String(inserted[0].folio).padStart(6, '0');
    res.status(201).json({ ok: true, id, codigo });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}

