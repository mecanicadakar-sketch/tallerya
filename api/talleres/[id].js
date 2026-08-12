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

    // acciones rápidas: solo cambiar estado o destacado
    if (keys.length === 1 && keys[0] === 'estado') {
      await sql`UPDATE talleres SET estado = ${b.estado} WHERE id = ${id}`;
      res.status(200).json({ ok: true });
      return;
    }
    if (keys.length === 1 && keys[0] === 'destacado') {
      await sql`UPDATE talleres SET destacado = ${b.destacado} WHERE id = ${id}`;
      res.status(200).json({ ok: true });
      return;
    }

    // edición completa
    const servicios = JSON.stringify(b.servicios || []);
    const lat = b.ubicacion ? b.ubicacion.lat : null;
    const lng = b.ubicacion ? b.ubicacion.lng : null;
    const imagenesArr = Array.isArray(b.imagenes) ? b.imagenes.filter(Boolean).slice(0, 5) : [];
    const imagenesJson = JSON.stringify(imagenesArr);
    const primeraImagen = imagenesArr[0] || b.imagen || '';
    await sql`
      UPDATE talleres SET
        nombre = ${b.nombre}, categoria = ${b.categoria || ''}, ciudad = ${b.ciudad}, direccion = ${b.direccion},
        horario = ${b.horario || ''}, descripcion = ${b.descripcion || ''}, servicios = ${servicios}::jsonb,
        telefono = ${b.telefono || ''}, whatsapp = ${b.whatsapp}, email = ${b.email || ''}, imagen = ${primeraImagen}, imagenes = ${imagenesJson}::jsonb,
        lat = ${lat}, lng = ${lng}, destacado_solicitado = ${Boolean(b.destacadoSolicitado)},
        auspicio_solicitado = ${Boolean(b.auspicioSolicitado)}, telefono_pago = ${b.telefonoPago || ''}
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
    await sql`DELETE FROM talleres WHERE id = ${id}`;
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
