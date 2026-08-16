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

    if (keys.length === 1 && keys[0] === 'estado') {
      const estado = sanitizeText(b.estado, 20);
      await sql`UPDATE productos SET estado = ${estado} WHERE id = ${id}`;
      res.status(200).json({ ok: true });
      return;
    }
    if (keys.length === 1 && keys[0] === 'destacado') {
      await sql`UPDATE productos SET destacado = ${Boolean(b.destacado)} WHERE id = ${id}`;
      res.status(200).json({ ok: true });
      return;
    }

    const nombre = sanitizeText(b.nombre, 120);
    const descripcion = sanitizeText(b.descripcion, 2000);
    const precio = sanitizeText(b.precio, 50);
    const categoria = sanitizeText(b.categoria, 80);
    const contacto = sanitizeText(b.contacto, 100);
    const whatsapp = sanitizeText(b.whatsapp, 50);
    const telefonoPago = sanitizeText(b.telefonoPago, 50);

    const imagenesArr = Array.isArray(b.imagenes) ? b.imagenes.filter(Boolean).slice(0, 5) : [];
    const cleanImagenes = imagenesArr.map(img => sanitizeText(img, 1500000));
    const imagenesJson = JSON.stringify(cleanImagenes);
    const primeraImagen = cleanImagenes[0] || sanitizeText(b.imagen, 1500000) || '';
    const destacadoVal = b.destacado !== undefined ? Boolean(b.destacado) : Boolean(b.destacadoSolicitado);

    await sql`
      UPDATE productos SET
        nombre = ${nombre}, descripcion = ${descripcion}, precio = ${precio},
        categoria = ${categoria}, contacto = ${contacto}, whatsapp = ${whatsapp},
        imagen = ${primeraImagen}, imagenes = ${imagenesJson}::jsonb,
        destacado = ${destacadoVal}, destacado_solicitado = ${Boolean(b.destacadoSolicitado)},
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
    await sql`DELETE FROM productos WHERE id = ${id}`;
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
