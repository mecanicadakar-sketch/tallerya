import { getSql, ensureSchema } from '../_db.js';
import { isAuthorized } from '../_auth.js';

function rowToProducto(r) {
  const imagenes = Array.isArray(r.imagenes) ? r.imagenes : [];
  return {
    id: r.id,
    nombre: r.nombre,
    descripcion: r.descripcion,
    precio: r.precio,
    categoria: r.categoria,
    imagen: r.imagen,
    imagenes: imagenes.length ? imagenes : (r.imagen ? [r.imagen] : []),
    contacto: r.contacto,
    whatsapp: r.whatsapp,
    estado: r.estado,
    destacado: r.destacado,
    destacadoSolicitado: r.destacado_solicitado,
    telefonoPago: r.telefono_pago,
    creado: r.created_at,
    codigo: 'TY-P-' + String(r.folio).padStart(6, '0')
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
      const rows = await sql`SELECT * FROM productos WHERE estado = ${estado} ORDER BY created_at DESC`;
      res.status(200).json(rows.map(rowToProducto));
      return;
    }

    const rows = authed
      ? await sql`SELECT * FROM productos ORDER BY created_at DESC`
      : await sql`SELECT * FROM productos WHERE estado = 'aprobado' ORDER BY created_at DESC`;
    res.status(200).json(rows.map(rowToProducto));
    return;
  }

  if (req.method === 'POST') {
    const b = req.body || {};
    if (!b.nombre || !b.whatsapp) {
      res.status(400).json({ error: 'Faltan campos obligatorios (nombre y WhatsApp).' });
      return;
    }
    const id = 'p' + Date.now() + Math.random().toString(36).slice(2, 7);
    const imagenesArr = Array.isArray(b.imagenes) ? b.imagenes.filter(Boolean).slice(0, 3) : [];
    const imagenesJson = JSON.stringify(imagenesArr);
    const primeraImagen = imagenesArr[0] || b.imagen || '';
    const inserted = await sql`
      INSERT INTO productos (id, nombre, descripcion, precio, categoria, imagen, imagenes, contacto, whatsapp, estado, destacado, destacado_solicitado, telefono_pago)
      VALUES (${id}, ${b.nombre}, ${b.descripcion || ''}, ${b.precio || ''}, ${b.categoria || ''}, ${primeraImagen}, ${imagenesJson}::jsonb, ${b.contacto || ''}, ${b.whatsapp}, 'pendiente', false, ${Boolean(b.destacadoSolicitado)}, ${b.telefonoPago || ''})
      RETURNING folio
    `;
    const codigo = 'TY-P-' + String(inserted[0].folio).padStart(6, '0');
    res.status(201).json({ ok: true, id, codigo });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
