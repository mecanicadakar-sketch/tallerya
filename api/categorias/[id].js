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

  if (req.method === 'DELETE') {
    if (!isAuthorized(req)) {
      res.status(401).json({ error: 'No autorizado' });
      return;
    }
    await sql`DELETE FROM categorias WHERE id = ${id}`;
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
