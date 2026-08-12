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

    if (keys.length === 1 && keys[0] === 'estado') {
      await sql`UPDATE productos SET estado = ${b.estado} WHERE id = ${id}`;
      res.status(200).json({ ok: true });
      return;
    }
    if (keys.length === 1 && keys[0] === 'destacado') {
      await sql`UPDATE productos SET destacado = ${b.destacado} WHERE id = ${id}`;
      res.status(200).json({ ok: true });
      return;
    }

    const imagenesArr = Array.isArray(b.imagenes) ? b.imagenes.filter(Boolean).slice(0, 3) : [];
    const imagenesJson = JSON.stringify(imagenesArr);
    const primeraImagen = imagenesArr[0] || b.imagen || '';
    await sql`
      UPDATE productos SET
        nombre = ${b.nombre}, descripcion = ${b.descripcion || ''}, precio = ${b.precio || ''},
        categoria = ${b.categoria || ''}, imagen = ${primeraImagen}, imagenes = ${imagenesJson}::jsonb, contacto = ${b.contacto || ''},
        whatsapp = ${b.whatsapp}, destacado_solicitado = ${Boolean(b.destacadoSolicitado)}, telefono_pago = ${b.telefonoPago || ''}
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
    await sql`DELETE FROM productos WHERE id = ${id}`;
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
