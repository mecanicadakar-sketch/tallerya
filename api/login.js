import { checkCredentials, setAuthCookie } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const { user, pin } = req.body || {};
  const result = checkCredentials(user, pin);
  if (!result.ok) {
    const msg = result.reason === 'no-config'
      ? 'El servidor no tiene configurado ADMIN_USER/ADMIN_PIN (revisá las variables de entorno en Vercel).'
      : 'Usuario o PIN incorrecto.';
    res.status(401).json({ ok: false, error: msg, reason: result.reason });
    return;
  }
  setAuthCookie(res);
  res.status(200).json({ ok: true });
}
