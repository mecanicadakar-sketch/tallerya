import { getSql, ensureSchema } from '../_db.js';
import { isAuthorized } from '../_auth.js';
import { getClientIp, checkRateLimit, sanitizeText } from '../_security.js';
import { notifyAdminNewFeedback } from '../_notify.js';

function rowToFeedback(r) {
  return {
    id: r.id,
    tipo: r.tipo || 'valoracion',
    tallerId: r.taller_id || '',
    tallerNombre: r.taller_nombre || '',
    clienteNombre: r.cliente_nombre || '',
    clienteContacto: r.cliente_contacto || '',
    calificacion: Number(r.calificacion) || 5,
    titulo: r.titulo || '',
    mensaje: r.mensaje || '',
    estado: r.estado || 'aprobado',
    creado: r.created_at
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
    const tallerId = req.query.tallerId;
    const authed = isAuthorized(req);

    if (tallerId) {
      const rows = authed
        ? await sql`SELECT * FROM feedbacks WHERE taller_id = ${tallerId} ORDER BY created_at DESC`
        : await sql`SELECT * FROM feedbacks WHERE taller_id = ${tallerId} AND estado = 'aprobado' ORDER BY created_at DESC`;
      res.status(200).json(rows.map(rowToFeedback));
      return;
    }

    if (estado) {
      if (estado !== 'aprobado' && !authed) {
        res.status(401).json({ error: 'No autorizado' });
        return;
      }
      const rows = await sql`SELECT * FROM feedbacks WHERE estado = ${estado} ORDER BY created_at DESC`;
      res.status(200).json(rows.map(rowToFeedback));
      return;
    }

    const rows = authed
      ? await sql`SELECT * FROM feedbacks ORDER BY created_at DESC`
      : await sql`SELECT * FROM feedbacks WHERE estado = 'aprobado' ORDER BY created_at DESC`;
    res.status(200).json(rows.map(rowToFeedback));
    return;
  }

  if (req.method === 'POST') {
    const ip = getClientIp(req);
    // Rate limit feedback: max 8 submissions per 10 minutes per IP
    const rateStatus = checkRateLimit('feedback_submit', ip, 8, 10 * 60 * 1000);
    if (!rateStatus.allowed) {
      res.status(429).json({ error: 'Has enviado varias opiniones recientemente. Por favor esperá unos minutos.' });
      return;
    }

    const b = req.body || {};
    const clienteNombre = sanitizeText(b.clienteNombre, 100);
    const mensaje = sanitizeText(b.mensaje, 1000);

    if (!clienteNombre || !mensaje) {
      res.status(400).json({ error: 'Faltan campos obligatorios (nombre del cliente y mensaje).' });
      return;
    }

    const id = 'fb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const tipo = sanitizeText(b.tipo, 30) || 'valoracion';
    const tallerId = sanitizeText(b.tallerId, 60);
    const tallerNombre = sanitizeText(b.tallerNombre, 120);
    const clienteContacto = sanitizeText(b.clienteContacto, 80);
    const calificacion = Math.max(1, Math.min(5, Number(b.calificacion) || 5));
    const titulo = sanitizeText(b.titulo, 120);
    const estado = 'aprobado'; // Auto-publish with moderation capability for admin

    await sql`
      INSERT INTO feedbacks (id, tipo, taller_id, taller_nombre, cliente_nombre, cliente_contacto, calificacion, titulo, mensaje, estado)
      VALUES (${id}, ${tipo}, ${tallerId}, ${tallerNombre}, ${clienteNombre}, ${clienteContacto}, ${calificacion}, ${titulo}, ${mensaje}, ${estado})
    `;

    // Notify administrator asynchronously
    notifyAdminNewFeedback({
      feedback: {
        id,
        tipo,
        tallerId,
        tallerNombre,
        clienteNombre,
        clienteContacto,
        calificacion,
        titulo,
        mensaje,
        estado
      },
      ip
    }).catch(err => console.error('[notifyAdminNewFeedback Async Error]:', err));

    res.status(201).json({ ok: true, id, message: 'Comentario recibido con éxito' });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
