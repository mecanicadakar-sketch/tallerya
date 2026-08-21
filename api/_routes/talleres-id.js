import { getSql, ensureSchema } from '../_db.js';
import { isAuthorized } from '../_auth.js';
import { getClientIp, checkRateLimit, sanitizeText } from '../_security.js';
import { notifyTallerAprobado, buildTallerAprobadoWhatsAppMsg, formatWhatsAppNumber } from '../_notify.js';

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
  if (!id) {
    res.status(400).json({ error: 'ID de taller requerido' });
    return;
  }

  if (req.method === 'POST' || (req.method === 'PATCH' && req.body && req.body.action === 'click')) {
    const ip = getClientIp(req);
    // Rate limit click spamming: max 1 click per 3s per taller per IP
    const rateStatus = checkRateLimit('taller_click', ip + '_' + id, 1, 3000);
    
    try {
      if (rateStatus.allowed) {
        const rows = await sql`UPDATE talleres SET clics = COALESCE(clics, 0) + 1 WHERE id = ${id} RETURNING clics`;
        const clics = rows && rows[0] ? Number(rows[0].clics) : 1;
        res.status(200).json({ ok: true, clics });
      } else {
        const rows = await sql`SELECT clics FROM talleres WHERE id = ${id}`;
        const clics = rows && rows[0] ? Number(rows[0].clics) : 1;
        res.status(200).json({ ok: true, clics });
      }
    } catch (err) {
      res.status(200).json({ ok: true, clics: 1 });
    }
    return;
  }

  if (req.method === 'PATCH') {
    if (!isAuthorized(req)) {
      res.status(401).json({ error: 'No autorizado' });
      return;
    }
    const b = req.body || {};
    const keys = Object.keys(b);

    // acciones rápidas: solo cambiar estado o destacado
    if (keys.length === 1 && keys[0] === 'estado') {
      const estado = sanitizeText(b.estado, 20);
      const prevRows = await sql`SELECT * FROM talleres WHERE id = ${id}`;
      const prevTaller = prevRows && prevRows[0] ? prevRows[0] : null;

      await sql`UPDATE talleres SET estado = ${estado} WHERE id = ${id}`;

      let waData = null;
      // Si pasa a estado 'aprobado', notificar automáticamente al postulante
      if (estado === 'aprobado' && prevTaller) {
        const host = req.headers ? (req.headers['x-forwarded-host'] || req.headers.host) : '';
        const proto = req.headers ? (req.headers['x-forwarded-proto'] || 'https') : 'https';
        const appUrl = host ? `${proto}://${host}` : '';
        const codigo = 'TY-T-' + String(prevTaller.folio || '').padStart(6, '0');

        const { texto, tallerUrl } = buildTallerAprobadoWhatsAppMsg({
          nombre: prevTaller.nombre,
          ciudad: prevTaller.ciudad,
          direccion: prevTaller.direccion,
          id: prevTaller.id,
          codigo,
          appUrl
        });

        const waTarget = formatWhatsAppNumber(prevTaller.whatsapp || prevTaller.telefono);
        const waLink = waTarget ? `https://wa.me/${waTarget}?text=${encodeURIComponent(texto)}` : null;

        waData = {
          waTarget,
          waLink,
          texto,
          tallerUrl,
          tallerNombre: prevTaller.nombre,
          tallerWhatsapp: prevTaller.whatsapp
        };

        // Disparo asíncrono
        notifyTallerAprobado({
          taller: { ...prevTaller, codigo },
          appUrl
        }).catch(err => console.error('[notifyTallerAprobado Async Error]:', err));
      }

      res.status(200).json({ ok: true, whatsapp: waData });
      return;
    }
    if (keys.length === 1 && keys[0] === 'destacado') {
      await sql`UPDATE talleres SET destacado = ${Boolean(b.destacado)} WHERE id = ${id}`;
      res.status(200).json({ ok: true });
      return;
    }

    // edición completa
    const nombre = sanitizeText(b.nombre, 120);
    const direccion = sanitizeText(b.direccion, 200);
    const ciudad = sanitizeText(b.ciudad, 100);
    const whatsapp = sanitizeText(b.whatsapp, 50);

    const rawServicios = Array.isArray(b.servicios) ? b.servicios : [];
    const cleanServicios = rawServicios.map(s => sanitizeText(s, 60)).filter(Boolean);
    const servicios = JSON.stringify(cleanServicios);

    let lat = null;
    let lng = null;
    if (b.ubicacion && typeof b.ubicacion.lat === 'number' && typeof b.ubicacion.lng === 'number') {
      if (b.ubicacion.lat >= -90 && b.ubicacion.lat <= 90 && b.ubicacion.lng >= -180 && b.ubicacion.lng <= 180) {
        lat = b.ubicacion.lat;
        lng = b.ubicacion.lng;
      }
    }

    const imagenesArr = Array.isArray(b.imagenes) ? b.imagenes.filter(Boolean).slice(0, 5) : [];
    const cleanImagenes = imagenesArr.map(img => sanitizeText(img, 1500000));
    const imagenesJson = JSON.stringify(cleanImagenes);
    const primeraImagen = cleanImagenes[0] || sanitizeText(b.imagen, 1500000) || '';
    const destacadoVal = b.destacado !== undefined ? Boolean(b.destacado) : Boolean(b.destacadoSolicitado);

    const categoria = sanitizeText(b.categoria, 80);
    const horario = sanitizeText(b.horario, 120);
    const descripcion = sanitizeText(b.descripcion, 2000);
    const telefono = sanitizeText(b.telefono, 50);
    const email = sanitizeText(b.email, 120);
    const telefonoPago = sanitizeText(b.telefonoPago, 50);

    await sql`
      UPDATE talleres SET
        nombre = ${nombre}, categoria = ${categoria}, ciudad = ${ciudad}, direccion = ${direccion},
        horario = ${horario}, descripcion = ${descripcion}, servicios = ${servicios}::jsonb,
        telefono = ${telefono}, whatsapp = ${whatsapp}, email = ${email}, imagen = ${primeraImagen}, imagenes = ${imagenesJson}::jsonb,
        lat = ${lat}, lng = ${lng}, destacado = ${destacadoVal}, destacado_solicitado = ${Boolean(b.destacadoSolicitado)},
        auspicio_solicitado = ${Boolean(b.auspicioSolicitado)}, telefono_pago = ${telefonoPago}
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
