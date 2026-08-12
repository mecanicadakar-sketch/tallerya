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

  if (req.method === 'GET') {
    const rows = await sql`SELECT id, nombre FROM categorias ORDER BY orden ASC, nombre ASC`;
    res.status(200).json(rows.map((r) => ({ id: r.id, nombre: r.nombre })));
    return;
  }

  if (req.method === 'POST') {
    if (!isAuthorized(req)) {
      res.status(401).json({ error: 'No autorizado' });
      return;
    }
    const nombre = (req.body && req.body.nombre || '').trim();
    if (!nombre) {
      res.status(400).json({ error: 'Falta el nombre de la categoría.' });
      return;
    }
    const maxOrden = await sql`SELECT COALESCE(MAX(orden), 0)::int AS max FROM categorias`;
    try {
      const inserted = await sql`
        INSERT INTO categorias (nombre, orden) VALUES (${nombre}, ${maxOrden[0].max + 1})
        RETURNING id, nombre
      `;
      res.status(201).json({ ok: true, categoria: inserted[0] });
    } catch (e) {
      res.status(409).json({ error: 'Esa categoría ya existe.' });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
