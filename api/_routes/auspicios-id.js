import { getSql, ensureSchema } from '../_db.js';
import { isAuthorized } from '../_auth.js';
import { sanitizeText } from '../_security.js';

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
  const { id } = req.query;

  if (req.method === 'PATCH') {
    if (!isAuthorized(req)) {
      res.status(401).json({ error: 'No autorizado' });
      return;
    }
    const b = req.body || {};
    const keys = Object.keys(b);

    if (keys.length === 1 && keys[0] === 'destacado') {
      await sql`UPDATE auspicios SET destacado = ${Boolean(b.destacado)} WHERE id = ${id}`;
      res.status(200).json({ ok: true });
      return;
    }

    const nombre = sanitizeText(b.nombre, 120);
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

    await sql`
      UPDATE auspicios SET
        nombre = ${nombre}, categoria = ${categoria}, horario = ${horario},
        descripcion = ${descripcion}, servicios = ${servicios}::jsonb,
        direccion = ${direccion}, ciudad = ${ciudad}, telefono = ${telefono},
        whatsapp = ${whatsapp}, email = ${email}, imagen = ${imagen},
        link = ${link}, lat = ${lat}, lng = ${lng}, destacado = ${destacadoVal}, destacado_solicitado = ${Boolean(b.destacadoSolicitado)},
        telefono_pago = ${telefonoPago}
      WHERE id = ${id}
    `;
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'DELETE') {
    if (!isAuthorized(req)) {
      res.status(401).json({ error: 'No autorizado' });
      return;
    }
    await sql`DELETE FROM auspicios WHERE id = ${id}`;
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
