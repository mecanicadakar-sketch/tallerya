import loginHandler from './_routes/login.js';
import logoutHandler from './_routes/logout.js';
import mecanicoLoginHandler from './_routes/mecanico-login.js';
import talleresHandler from './_routes/talleres.js';
import talleresIdHandler from './_routes/talleres-id.js';
import auspiciosHandler from './_routes/auspicios.js';
import auspiciosIdHandler from './_routes/auspicios-id.js';
import categoriasHandler from './_routes/categorias.js';
import categoriasIdHandler from './_routes/categorias-id.js';
import productosHandler from './_routes/productos.js';
import productosIdHandler from './_routes/productos-id.js';
import feedbacksHandler from './_routes/feedbacks.js';
import feedbacksIdHandler from './_routes/feedbacks-id.js';
import visitasHandler from './_routes/visitas.js';
import asistenteHandler from './_routes/asistente.js';
import chatHandler from './_routes/chat.js';

export default async function handler(req, res) {
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname.replace(/\/+$/, '') || '/';
  
  // Merge query parameters
  const query = { ...(req.query || {}) };
  urlObj.searchParams.forEach((val, key) => {
    if (!query[key]) query[key] = val;
  });
  req.query = query;

  // Handle parsing body if needed (string/buffer)
  if (req.body && typeof req.body === 'string') {
    try {
      req.body = JSON.parse(req.body);
    } catch (e) {
      // Keep as string
    }
  }

  // 1. Exact matches
  if (pathname === '/api/login') return loginHandler(req, res);
  if (pathname === '/api/logout') return logoutHandler(req, res);
  if (pathname === '/api/mecanico-login') return mecanicoLoginHandler(req, res);
  if (pathname === '/api/visitas') return visitasHandler(req, res);
  if (pathname === '/api/asistente') return asistenteHandler(req, res);
  if (pathname === '/api/chat') return chatHandler(req, res);

  // 2. Collection matches
  if (pathname === '/api/talleres') return talleresHandler(req, res);
  if (pathname === '/api/auspicios') return auspiciosHandler(req, res);
  if (pathname === '/api/categorias') return categoriasHandler(req, res);
  if (pathname === '/api/productos') return productosHandler(req, res);
  if (pathname === '/api/feedbacks') return feedbacksHandler(req, res);

  // 3. ID matches: /api/talleres/:id, etc.
  const talleresMatch = pathname.match(/^\/api\/talleres\/([^/]+)$/);
  if (talleresMatch) {
    req.query.id = decodeURIComponent(talleresMatch[1]);
    return talleresIdHandler(req, res);
  }

  const auspiciosMatch = pathname.match(/^\/api\/auspicios\/([^/]+)$/);
  if (auspiciosMatch) {
    req.query.id = decodeURIComponent(auspiciosMatch[1]);
    return auspiciosIdHandler(req, res);
  }

  const categoriasMatch = pathname.match(/^\/api\/categorias\/([^/]+)$/);
  if (categoriasMatch) {
    req.query.id = decodeURIComponent(categoriasMatch[1]);
    return categoriasIdHandler(req, res);
  }

  const productosMatch = pathname.match(/^\/api\/productos\/([^/]+)$/);
  if (productosMatch) {
    req.query.id = decodeURIComponent(productosMatch[1]);
    return productosIdHandler(req, res);
  }

  const feedbacksMatch = pathname.match(/^\/api\/feedbacks\/([^/]+)$/);
  if (feedbacksMatch) {
    req.query.id = decodeURIComponent(feedbacksMatch[1]);
    return feedbacksIdHandler(req, res);
  }

  res.status(404).json({ error: 'Endpoint no encontrado: ' + pathname });
}
