import { getSql, ensureSchema } from '../_db.js';
import { isAuthorized } from '../_auth.js';
import { getClientIp, checkRateLimit, sanitizeText } from '../_security.js';

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

    // Admin request for all products (includes pending and rejected)
    if (req.query.all && authed) {
      const rows = await sql`SELECT * FROM productos ORDER BY created_at DESC`;
      res.status(200).json(rows.map(rowToProducto));
      return;
    }

    // Public catalog ALWAYS sees only approved products
    const rows = await sql`SELECT * FROM productos WHERE estado = 'aprobado' ORDER BY created_at DESC`;
    res.status(200).json(rows.map(rowToProducto));
    return;
  }

  if (req.method === 'POST') {
    const ip = getClientIp(req);
    // Rate limit public product creation (max 8 per 10 minutes per IP)
    const rateStatus = checkRateLimit('product_submit', ip, 8, 10 * 60 * 1000);
    if (!rateStatus.allowed) {
      res.status(429).json({ error: 'Has publicado varios productos recientemente. Por favor esperá unos minutos.' });
      return;
    }

    const b = req.body || {};
    const nombre = sanitizeText(b.nombre, 120);
    const whatsapp = sanitizeText(b.whatsapp, 50);

    if (!nombre || !whatsapp) {
      res.status(400).json({ error: 'Faltan campos obligatorios (nombre y WhatsApp).' });
      return;
    }

    const id = 'p' + Date.now() + Math.random().toString(36).slice(2, 7);
    const imagenesArr = Array.isArray(b.imagenes) ? b.imagenes.filter(Boolean).slice(0, 5) : [];
    const cleanImagenes = imagenesArr.map(img => sanitizeText(img, 1500000));
    const imagenesJson = JSON.stringify(cleanImagenes);
    const primeraImagen = cleanImagenes[0] || sanitizeText(b.imagen, 1500000) || '';

    const descripcion = sanitizeText(b.descripcion, 2000);
    const precio = sanitizeText(b.precio, 50);
    const categoria = sanitizeText(b.categoria, 80);
    const contacto = sanitizeText(b.contacto, 100);
    const telefonoPago = sanitizeText(b.telefonoPago, 50);

    const inserted = await sql`
      INSERT INTO productos (id, nombre, descripcion, precio, categoria, imagen, imagenes, contacto, whatsapp, estado, destacado, destacado_solicitado, telefono_pago)
      VALUES (${id}, ${nombre}, ${descripcion}, ${precio}, ${categoria}, ${primeraImagen}, ${imagenesJson}::jsonb, ${contacto}, ${whatsapp}, 'pendiente', false, ${Boolean(b.destacadoSolicitado)}, ${telefonoPago})
      RETURNING folio
    `;
    const codigo = 'TY-P-' + String(inserted[0].folio).padStart(6, '0');
    res.status(201).json({ ok: true, id, codigo });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}

