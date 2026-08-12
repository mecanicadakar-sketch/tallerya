import { getSql, ensureSchema } from '../_db.js';
import { isAuthorized } from '../_auth.js';

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
      await sql`UPDATE auspicios SET destacado = ${b.destacado} WHERE id = ${id}`;
      res.status(200).json({ ok: true });
      return;
    }

    const servicios = JSON.stringify(b.servicios || []);
    const lat = b.ubicacion ? b.ubicacion.lat : null;
    const lng = b.ubicacion ? b.ubicacion.lng : null;
    await sql`
      UPDATE auspicios SET
        nombre = ${b.nombre}, categoria = ${b.categoria || ''}, horario = ${b.horario || ''},
        descripcion = ${b.descripcion || ''}, servicios = ${servicios}::jsonb,
        direccion = ${b.direccion || ''}, ciudad = ${b.ciudad || ''}, telefono = ${b.telefono || ''},
        whatsapp = ${b.whatsapp || ''}, email = ${b.email || ''}, imagen = ${b.imagen || ''},
        link = ${b.link || ''}, lat = ${lat}, lng = ${lng}, destacado_solicitado = ${Boolean(b.destacadoSolicitado)},
        telefono_pago = ${b.telefonoPago || ''}
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
