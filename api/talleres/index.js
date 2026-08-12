import { getSql, ensureSchema } from '../_db.js';
import { isAuthorized } from '../_auth.js';

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
    ubicacion: r.lat != null && r.lng != null ? { lat: r.lat, lng: r.lng } : null,
    estado: r.estado,
    destacado: r.destacado,
    destacadoSolicitado: r.destacado_solicitado,
    auspicioSolicitado: r.auspicio_solicitado,
    telefonoPago: r.telefono_pago,
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

    const rows = authed
      ? await sql`SELECT * FROM talleres ORDER BY created_at DESC`
      : await sql`SELECT * FROM talleres WHERE estado = 'aprobado' ORDER BY created_at DESC`;
    res.status(200).json(rows.map(rowToTaller));
    return;
  }

  if (req.method === 'POST') {
    const b = req.body || {};
    if (!b.nombre || !b.direccion || !b.ciudad || !b.whatsapp) {
      res.status(400).json({ error: 'Faltan campos obligatorios (nombre, dirección, ciudad, WhatsApp).' });
      return;
    }
    const id = 't' + Date.now() + Math.random().toString(36).slice(2, 7);
    const servicios = JSON.stringify(b.servicios || []);
    const lat = b.ubicacion ? b.ubicacion.lat : null;
    const lng = b.ubicacion ? b.ubicacion.lng : null;
    const imagenesArr = Array.isArray(b.imagenes) ? b.imagenes.filter(Boolean).slice(0, 5) : [];
    const imagenesJson = JSON.stringify(imagenesArr);
    const primeraImagen = imagenesArr[0] || b.imagen || '';

    const inserted = await sql`
      INSERT INTO talleres (id, nombre, categoria, ciudad, direccion, horario, descripcion, servicios, telefono, whatsapp, email, imagen, imagenes, lat, lng, estado, destacado, destacado_solicitado, auspicio_solicitado, telefono_pago)
      VALUES (${id}, ${b.nombre}, ${b.categoria || ''}, ${b.ciudad}, ${b.direccion}, ${b.horario || ''}, ${b.descripcion || ''}, ${servicios}::jsonb, ${b.telefono || ''}, ${b.whatsapp}, ${b.email || ''}, ${primeraImagen}, ${imagenesJson}::jsonb, ${lat}, ${lng}, 'pendiente', false, ${Boolean(b.destacadoSolicitado)}, ${Boolean(b.auspicioSolicitado)}, ${b.telefonoPago || ''})
      RETURNING folio
    `;
    const codigo = 'TY-T-' + String(inserted[0].folio).padStart(6, '0');
    res.status(201).json({ ok: true, id, codigo });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
