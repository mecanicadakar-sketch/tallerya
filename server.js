import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

import loginHandler from './api/_routes/login.js';
import logoutHandler from './api/_routes/logout.js';
import mecanicoLoginHandler from './api/_routes/mecanico-login.js';
import talleresHandler from './api/_routes/talleres.js';
import talleresIdHandler from './api/_routes/talleres-id.js';
import auspiciosHandler from './api/_routes/auspicios.js';
import auspiciosIdHandler from './api/_routes/auspicios-id.js';
import categoriasHandler from './api/_routes/categorias.js';
import categoriasIdHandler from './api/_routes/categorias-id.js';
import productosHandler from './api/_routes/productos.js';
import productosIdHandler from './api/_routes/productos-id.js';
import feedbacksHandler from './api/_routes/feedbacks.js';
import feedbacksIdHandler from './api/_routes/feedbacks-id.js';
import visitasHandler from './api/_routes/visitas.js';
import asistenteHandler from './api/_routes/asistente.js';
import chatHandler from './api/_routes/chat.js';
import { getClientIp, checkRateLimit, isValidOrigin, logSecurityEvent } from './api/_security.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// 1. Disable server fingerprinting
app.disable('x-powered-by');

// 2. Global Security Headers (compatible with Cloud Run and iframe preview)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()');
  next();
});

// 3. Request Parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 4. Global API WAF & Rate Limiting (180 reqs/min per IP)
app.use('/api', (req, res, next) => {
  const ip = getClientIp(req);
  
  // Rate limit check
  const rateStatus = checkRateLimit('global_api', ip, 180, 60 * 1000);
  if (!rateStatus.allowed) {
    return res.status(429).json({
      error: 'Límite de solicitudes superado. Por favor esperá unos segundos.',
      retryAfterSeconds: rateStatus.retryAfterSeconds
    });
  }

  // Anti-CSRF Origin Validation on mutating methods
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
    if (!isValidOrigin(req)) {
      logSecurityEvent('CSRF_BLOCKED', { ip, path: req.path, origin: req.headers.origin });
      return res.status(403).json({ error: 'Solicitud bloqueada por política de origen de seguridad (Anti-CSRF)' });
    }
  }

  next();
});

function adapt(handler) {
  return async (req, res, next) => {
    try {
      const mergedQuery = { ...(req.query || {}), ...(req.params || {}) };
      Object.defineProperty(req, 'query', {
        value: mergedQuery,
        writable: true,
        configurable: true,
        enumerable: true
      });
      await handler(req, res);
    } catch (err) {
      console.error('[API Handler Error]:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: err.message || 'Error del servidor' });
      }
    }
  };
}

// API Routes
app.all('/api/login', adapt(loginHandler));
app.all('/api/logout', adapt(logoutHandler));
app.all('/api/mecanico-login', adapt(mecanicoLoginHandler));

app.all('/api/talleres/:id', adapt(talleresIdHandler));
app.all('/api/talleres', adapt(talleresHandler));

app.all('/api/auspicios/:id', adapt(auspiciosIdHandler));
app.all('/api/auspicios', adapt(auspiciosHandler));

app.all('/api/categorias/:id', adapt(categoriasIdHandler));
app.all('/api/categorias', adapt(categoriasHandler));

app.all('/api/productos/:id', adapt(productosIdHandler));
app.all('/api/productos', adapt(productosHandler));

app.all('/api/feedbacks/:id', adapt(feedbacksIdHandler));
app.all('/api/feedbacks', adapt(feedbacksHandler));

app.all('/api/visitas', adapt(visitasHandler));

app.all('/api/asistente', adapt(asistenteHandler));
app.all('/api/chat', adapt(chatHandler));

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

// Fallback to index.html
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`TallerYa server running on http://0.0.0.0:${PORT}`);
});
