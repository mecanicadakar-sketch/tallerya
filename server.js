import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

import loginHandler from './api/login.js';
import logoutHandler from './api/logout.js';
import talleresHandler from './api/talleres/index.js';
import talleresIdHandler from './api/talleres/[id].js';
import auspiciosHandler from './api/auspicios/index.js';
import auspiciosIdHandler from './api/auspicios/[id].js';
import categoriasHandler from './api/categorias/index.js';
import categoriasIdHandler from './api/categorias/[id].js';
import productosHandler from './api/productos/index.js';
import productosIdHandler from './api/productos/[id].js';
import asistenteHandler from './api/asistente.js';
import chatHandler from './api/chat.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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

app.all('/api/talleres/:id', adapt(talleresIdHandler));
app.all('/api/talleres', adapt(talleresHandler));

app.all('/api/auspicios/:id', adapt(auspiciosIdHandler));
app.all('/api/auspicios', adapt(auspiciosHandler));

app.all('/api/categorias/:id', adapt(categoriasIdHandler));
app.all('/api/categorias', adapt(categoriasHandler));

app.all('/api/productos/:id', adapt(productosIdHandler));
app.all('/api/productos', adapt(productosHandler));

app.all('/api/asistente', adapt(asistenteHandler));
app.all('/api/chat', adapt(chatHandler));

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

// Fallback to index.html
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`TallerYa server running on http://0.0.0.0:${PORT}`);
});
