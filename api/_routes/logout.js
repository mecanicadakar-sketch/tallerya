import { clearAuthCookie } from '../_auth.js';

export default function handler(req, res) {
  clearAuthCookie(res);
  res.status(200).json({ ok: true });
}
