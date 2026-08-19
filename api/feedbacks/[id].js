import { getSql, ensureSchema } from '../_db.js';
import { isAuthorized } from '../_auth.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'No autorizado' });
    return;
  }

  let sql;
  try {
    await ensureSchema();
    sql = getSql();
  } catch (e) {
    res.status(500).json({ error: 'Error de base de datos: ' + e.message });
    return;
  }

  const id = req.query.id;
  if (!id) {
    res.status(400).json({ error: 'ID requerido' });
    return;
  }

  if (req.method === 'PATCH') {
    const b = req.body || {};
    const estado = b.estado;
    if (!estado || !['pendiente', 'aprobado', 'rechazado'].includes(estado)) {
      res.status(400).json({ error: 'Estado inválido' });
      return;
    }
    const updated = await sql`
      UPDATE feedbacks
      SET estado = ${estado}
      WHERE id = ${id}
      RETURNING *
    `;
    if (!updated.length) {
      res.status(404).json({ error: 'No encontrado' });
      return;
    }
    res.status(200).json({ ok: true, feedback: updated[0] });
    return;
  }

  if (req.method === 'DELETE') {
    const deleted = await sql`
      DELETE FROM feedbacks WHERE id = ${id} RETURNING id
    `;
    if (!deleted.length) {
      res.status(404).json({ error: 'No encontrado' });
      return;
    }
    res.status(200).json({ ok: true, deleted: id });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
