import { neon } from '@neondatabase/serverless';

let sqlClient = null;
let useMock = false;

// In-memory data store for fallback/preview mode when Neon is not configured
const mockData = {
  talleres: [
    {
      id: 't1', nombre: 'Mecánica Cáceres', categoria: 'Mecánica General',
      ciudad: 'Encarnación (Itapúa)', direccion: 'Arroyo Pora, Encarnación (Itapúa)',
      horario: 'Lun-Vie 7:00 a 18:00 hs.', descripcion: 'Taller de mecánica general con más de 10 años de experiencia.',
      servicios: ['Motores', 'Mantenimientos', 'Frenos', 'Diagnóstico Computarizado'],
      telefono: '+59598 5143218', whatsapp: '+59598 5143218', email: '', imagen: '', imagenes: [],
      lat: -27.33, lng: -55.86, estado: 'aprobado', destacado: true,
      destacado_solicitado: false, auspicio_solicitado: false, telefono_pago: '',
      clics: 184,
      created_at: new Date().toISOString(), folio: 1
    },
    {
      id: 't2', nombre: 'Mecánica Dakar', categoria: 'Mecánica General',
      ciudad: 'Encarnación (Itapúa)', direccion: 'Barrio Santa María III km. 3.5 Ruta 6 detrás de Diesa, Encarnación (Itapúa)',
      horario: 'Lun-Vier 7:30 a 17:30', descripcion: 'Repuestos y servicios automotriz, diagnóstico computarizado e inyección electrónica.',
      servicios: ['Diagnóstico Computarizado', 'Frenos', 'Suspensión y Dirección'],
      telefono: '+59597 5635770', whatsapp: '+59597 5635770', email: '', imagen: '', imagenes: [],
      lat: -27.32, lng: -55.85, estado: 'aprobado', destacado: true,
      destacado_solicitado: false, auspicio_solicitado: false, telefono_pago: '',
      clics: 342,
      created_at: new Date().toISOString(), folio: 2
    },
    {
      id: 't3', nombre: 'Mecánica Dakar - Repuestos', categoria: 'Repuestos',
      ciudad: 'Encarnación (Itapúa)', direccion: 'Barrio Santa María III km. 3.5 Ruta 6 detrás de Diesa, Encarnación (Itapúa)',
      horario: 'Lun Vier 7:30 a17:30', descripcion: 'Auto-repuestos y servicios de inyección electrónica.',
      servicios: ['Accesorios', 'Frenos', 'Diagnóstico Computarizado'],
      telefono: '+59597 5635770', whatsapp: '+59597 5635770', email: '', imagen: '', imagenes: [],
      lat: -27.32, lng: -55.85, estado: 'aprobado', destacado: true,
      destacado_solicitado: false, auspicio_solicitado: false, telefono_pago: '',
      clics: 129,
      created_at: new Date().toISOString(), folio: 3
    }
  ],
  visitas: { total: 1850 },
  auspicios: [
    {
      id: 's1', nombre: 'Auto Repuestos Dakar', categoria: 'Repuestos',
      horario: 'Lun-Sáb 7:00 a 18:00', descripcion: 'Venta de Repuestos Automotriz de Varias Marcas',
      servicios: [], direccion: 'Encarnación', ciudad: 'Encarnación (Itapúa)',
      telefono: '+59597 5635770', whatsapp: '+59597 5635770', email: '', imagen: '', link: '',
      lat: -27.32, lng: -55.85, destacado: true, destacado_solicitado: false, telefono_pago: '',
      created_at: new Date().toISOString(), folio: 1
    }
  ],
  categorias: [
    "Mecánica General", "Electricidad Automotriz", "Carrocería y Pintura", "Frenos",
    "Suspensión y Dirección", "Alineación y Balanceo", "Diagnóstico Computarizado",
    "Inyección Electrónica", "Gomería", "Lavadero", "Grúa", "Repuestos",
    "Accesorios", "Estación de Servicio", "Servicios Múltiples", "Otros"
  ].map((nombre, i) => ({ id: i + 1, nombre, orden: i })),
  productos: [],
  feedbacks: [
    {
      id: 'fb1',
      tipo: 'valoracion',
      taller_id: 't2',
      taller_nombre: 'Mecánica Dakar',
      cliente_nombre: 'Carlos Benítez',
      cliente_contacto: '0981 445566',
      calificacion: 5,
      titulo: 'Excelente atención y diagnóstico rápido',
      mensaje: 'Solucionaron el problema de inyección de mi vehículo en el día. Muy profesionales y precios justos.',
      estado: 'aprobado',
      created_at: new Date(Date.now() - 86400000 * 2).toISOString()
    },
    {
      id: 'fb2',
      tipo: 'valoracion',
      taller_id: 't1',
      taller_nombre: 'Mecánica Cáceres',
      cliente_nombre: 'Lilian Duarte',
      cliente_contacto: '0975 112233',
      calificacion: 5,
      titulo: 'Muy confiables y puntuales',
      mensaje: 'Hicieron mantenimiento completo de frenos y suspensión. Quedó impecable.',
      estado: 'aprobado',
      created_at: new Date(Date.now() - 86400000 * 5).toISOString()
    },
    {
      id: 'fb3',
      tipo: 'sugerencia',
      taller_id: '',
      taller_nombre: 'TallerYa Plataforma',
      cliente_nombre: 'Marcos Rivas',
      cliente_contacto: 'marcos.r@gmail.com',
      calificacion: 5,
      titulo: 'Incorporar recordatorio de mantenimiento por WhatsApp',
      mensaje: 'Sería genial recibir alertas automáticas cuando toque el cambio de aceite o revisión técnica.',
      estado: 'aprobado',
      created_at: new Date(Date.now() - 86400000 * 1).toISOString()
    }
  ]
};

let folioCounter = 10;

function createMockSql() {
  const mockSql = async function(strings, ...values) {
    const query = typeof strings === 'string' ? strings : strings.reduce((acc, str, i) => acc + str + (values[i] !== undefined ? `$${i + 1}` : ''), '');
    const qUpper = query.toUpperCase();

    // SELECT COUNT
    if (qUpper.includes('SELECT COUNT(*)::INT AS COUNT FROM TALLERES')) {
      return [{ count: mockData.talleres.length }];
    }
    if (qUpper.includes('SELECT COUNT(*)::INT AS COUNT FROM AUSPICIOS')) {
      return [{ count: mockData.auspicios.length }];
    }
    if (qUpper.includes('SELECT COUNT(*)::INT AS COUNT FROM CATEGORIAS')) {
      return [{ count: mockData.categorias.length }];
    }
    if (qUpper.includes('SELECT COUNT(*)::INT AS COUNT FROM FEEDBACKS')) {
      return [{ count: mockData.feedbacks ? mockData.feedbacks.length : 0 }];
    }
    if (qUpper.includes('SELECT COUNT(*)::INT AS COUNT FROM VISITAS')) {
      return [{ count: 1 }];
    }
    if (qUpper.includes('SELECT COALESCE(MAX(ORDEN), 0)::INT AS MAX FROM CATEGORIAS')) {
      const max = mockData.categorias.reduce((m, c) => Math.max(m, c.orden || 0), 0);
      return [{ max }];
    }

    // SELECT VISITAS
    if (qUpper.includes('FROM VISITAS')) {
      const total = mockData.visitas ? mockData.visitas.total : 1850;
      return [{ total }];
    }

    // SELECT TALLERES
    if (qUpper.includes('FROM TALLERES')) {
      let result = [...mockData.talleres];
      if (qUpper.includes("USUARIO_LOGIN") || qUpper.includes("USUARIO_PASS")) {
        const u = String(values[0] || '').toLowerCase();
        const p = String(values[1] || '');
        const matched = result.filter(t => 
          ((t.usuario_login && t.usuario_login.toLowerCase() === u) || (t.email && t.email.toLowerCase() === u)) &&
          String(t.usuario_pass || '') === p
        );
        return matched;
      }
      if (qUpper.includes("WHERE ID =")) {
        const targetId = values[values.length - 1];
        const found = result.find(t => t.id === targetId);
        return found ? [found] : [];
      }
      if (qUpper.includes("ESTADO = 'APROBADO'")) {
        result = result.filter(t => t.estado === 'aprobado');
      } else if (qUpper.includes("ESTADO = $1") || qUpper.includes("WHERE ESTADO =")) {
        const estadoVal = values[0];
        if (estadoVal) result = result.filter(t => t.estado === estadoVal);
      }
      return result;
    }

    // SELECT AUSPICIOS
    if (qUpper.includes('FROM AUSPICIOS')) {
      let result = [...mockData.auspicios];
      if (qUpper.includes("WHERE ID =")) {
        const targetId = values[values.length - 1];
        const found = result.find(a => a.id === targetId);
        return found ? [found] : [];
      }
      return result;
    }

    // SELECT CATEGORIAS
    if (qUpper.includes('FROM CATEGORIAS')) {
      return [...mockData.categorias].sort((a, b) => (a.orden || 0) - (b.orden || 0));
    }

    // SELECT PRODUCTOS
    if (qUpper.includes('FROM PRODUCTOS')) {
      let result = [...mockData.productos];
      if (qUpper.includes("WHERE ID =")) {
        const targetId = values[values.length - 1];
        const found = result.find(p => p.id === targetId);
        return found ? [found] : [];
      }
      if (qUpper.includes("ESTADO = 'APROBADO'")) {
        result = result.filter(p => p.estado === 'aprobado');
      } else if (values[0]) {
        result = result.filter(p => p.estado === values[0]);
      }
      return result;
    }

    // SELECT FEEDBACKS
    if (qUpper.includes('FROM FEEDBACKS')) {
      let result = [...(mockData.feedbacks || [])];
      if (qUpper.includes("WHERE ID =")) {
        const targetId = values[values.length - 1];
        const found = result.find(f => f.id === targetId);
        return found ? [found] : [];
      }
      if (qUpper.includes("ESTADO = 'APROBADO'")) {
        result = result.filter(f => f.estado === 'aprobado');
      } else if (qUpper.includes("TALLER_ID =")) {
        const tid = values[values.length - 1];
        result = result.filter(f => f.taller_id === tid);
      } else if (values[0]) {
        result = result.filter(f => f.estado === values[0]);
      }
      return result.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    }

    // INSERT TALLERES
    if (qUpper.includes('INSERT INTO TALLERES')) {
      const id = values[0];
      const nombre = values[1];
      const categoria = values[2];
      const ciudad = values[3];
      const direccion = values[4];
      const horario = values[5];
      const descripcion = values[6];
      const servicios = typeof values[7] === 'string' ? JSON.parse(values[7]) : (values[7] || []);
      const telefono = values[8];
      const whatsapp = values[9];
      const email = values[10];
      const imagen = values[11];
      const imagenes = typeof values[12] === 'string' ? JSON.parse(values[12]) : (values[12] || []);
      const lat = values[13];
      const lng = values[14];
      const estado = values[15] || 'pendiente';
      const destacado = Boolean(values[16]);
      const destacado_solicitado = Boolean(values[17]);
      const auspicio_solicitado = Boolean(values[18]);
      const telefono_pago = values[19] || '';
      const usuario_login = values[20] || '';
      const usuario_pass = values[21] || '';
      const folio = ++folioCounter;

      const item = { id, nombre, categoria, ciudad, direccion, horario, descripcion, servicios, telefono, whatsapp, email, imagen, imagenes, lat, lng, estado, destacado, destacado_solicitado, auspicio_solicitado, telefono_pago, usuario_login, usuario_pass, created_at: new Date().toISOString(), folio };
      const idx = mockData.talleres.findIndex(t => t.id === id);
      if (idx >= 0) mockData.talleres[idx] = item;
      else mockData.talleres.unshift(item);
      return [{ folio }];
    }

    // INSERT AUSPICIOS
    if (qUpper.includes('INSERT INTO AUSPICIOS')) {
      const id = values[0];
      const nombre = values[1];
      const categoria = values[2];
      const horario = values[3];
      const descripcion = values[4];
      const servicios = typeof values[5] === 'string' ? JSON.parse(values[5]) : (values[5] || []);
      const direccion = values[6];
      const ciudad = values[7];
      const telefono = values[8];
      const whatsapp = values[9];
      const email = values[10];
      const imagen = values[11];
      const link = values[12];
      const lat = values[13];
      const lng = values[14];
      const destacado = Boolean(values[15]);
      const destacado_solicitado = Boolean(values[16]);
      const telefono_pago = values[17] || '';
      const folio = ++folioCounter;

      const item = { id, nombre, categoria, horario, descripcion, servicios, direccion, ciudad, telefono, whatsapp, email, imagen, link, lat, lng, destacado, destacado_solicitado, telefono_pago, created_at: new Date().toISOString(), folio };
      const idx = mockData.auspicios.findIndex(a => a.id === id);
      if (idx >= 0) mockData.auspicios[idx] = item;
      else mockData.auspicios.unshift(item);
      return [{ folio }];
    }

    // INSERT CATEGORIAS
    if (qUpper.includes('INSERT INTO CATEGORIAS')) {
      const nombre = values[0];
      const orden = values[1] || mockData.categorias.length + 1;
      const id = mockData.categorias.length + 1;
      const existing = mockData.categorias.find(c => c.nombre.toLowerCase() === nombre.toLowerCase());
      if (existing) {
        if (qUpper.includes('ON CONFLICT')) return [existing];
        throw new Error('Esa categoría ya existe.');
      }
      const item = { id, nombre, orden };
      mockData.categorias.push(item);
      return [item];
    }

    // INSERT VISITAS
    if (qUpper.includes('INSERT INTO VISITAS')) {
      mockData.visitas = mockData.visitas || { total: 1850 };
      mockData.visitas.total++;
      return [{ total: mockData.visitas.total }];
    }

    // INSERT PRODUCTOS
    if (qUpper.includes('INSERT INTO PRODUCTOS')) {
      const id = values[0];
      const nombre = values[1];
      const descripcion = values[2];
      const precio = values[3];
      const categoria = values[4];
      const imagen = values[5];
      const imagenes = typeof values[6] === 'string' ? JSON.parse(values[6]) : (values[6] || []);
      const contacto = values[7];
      const whatsapp = values[8];
      const estado = values[9] || 'pendiente';
      const destacado = Boolean(values[10]);
      const destacado_solicitado = Boolean(values[11]);
      const telefono_pago = values[12] || '';
      const folio = ++folioCounter;

      const item = { id, nombre, descripcion, precio, categoria, imagen, imagenes, contacto, whatsapp, estado, destacado, destacado_solicitado, telefono_pago, created_at: new Date().toISOString(), folio };
      mockData.productos.unshift(item);
      return [{ folio }];
    }

    // INSERT FEEDBACKS
    if (qUpper.includes('INSERT INTO FEEDBACKS')) {
      const id = values[0];
      const tipo = values[1] || 'valoracion';
      const taller_id = values[2] || '';
      const taller_nombre = values[3] || '';
      const cliente_nombre = values[4];
      const cliente_contacto = values[5] || '';
      const calificacion = Number(values[6]) || 5;
      const titulo = values[7] || '';
      const mensaje = values[8] || '';
      const estado = values[9] || 'aprobado';

      const item = {
        id, tipo, taller_id, taller_nombre, cliente_nombre, cliente_contacto,
        calificacion, titulo, mensaje, estado, created_at: new Date().toISOString()
      };
      mockData.feedbacks = mockData.feedbacks || [];
      mockData.feedbacks.unshift(item);
      return [item];
    }

    // UPDATE TALLERES
    if (qUpper.includes('UPDATE TALLERES')) {
      const id = values[values.length - 1];
      const item = mockData.talleres.find(t => t.id === id);
      if (item) {
        if (qUpper.includes('SET CLICS =')) {
          item.clics = (item.clics || 0) + 1;
          return [{ clics: item.clics }];
        } else if (qUpper.includes('SET ESTADO =') && values.length === 2) {
          item.estado = values[0];
        } else if (qUpper.includes('SET DESTACADO =') && values.length === 2) {
          item.destacado = Boolean(values[0]);
        } else {
          // Full update from PATCH /api/talleres/[id]
          if (values[0] !== undefined) item.nombre = values[0];
          if (values[1] !== undefined) item.categoria = values[1];
          if (values[2] !== undefined) item.ciudad = values[2];
          if (values[3] !== undefined) item.direccion = values[3];
          if (values[4] !== undefined) item.horario = values[4];
          if (values[5] !== undefined) item.descripcion = values[5];
          if (values[6] !== undefined) item.servicios = typeof values[6] === 'string' ? JSON.parse(values[6]) : (values[6] || []);
          if (values[7] !== undefined) item.telefono = values[7];
          if (values[8] !== undefined) item.whatsapp = values[8];
          if (values[9] !== undefined) item.email = values[9];
          if (values[10] !== undefined) item.imagen = values[10];
          if (values[11] !== undefined) item.imagenes = typeof values[11] === 'string' ? JSON.parse(values[11]) : (values[11] || []);
          if (values[12] !== undefined) item.lat = values[12];
          if (values[13] !== undefined) item.lng = values[13];
          if (values[14] !== undefined) item.destacado = Boolean(values[14]);
          if (values[15] !== undefined) item.destacado_solicitado = Boolean(values[15]);
          if (values[16] !== undefined) item.auspicio_solicitado = Boolean(values[16]);
          if (values[17] !== undefined) item.telefono_pago = values[17] || '';
        }
      }
      return [];
    }

    // UPDATE AUSPICIOS
    if (qUpper.includes('UPDATE AUSPICIOS')) {
      const id = values[values.length - 1];
      const item = mockData.auspicios.find(a => a.id === id);
      if (item) {
        if (qUpper.includes('SET DESTACADO =') && values.length === 2) {
          item.destacado = Boolean(values[0]);
        } else {
          if (values[0] !== undefined) item.nombre = values[0];
          if (values[1] !== undefined) item.categoria = values[1];
          if (values[2] !== undefined) item.horario = values[2];
          if (values[3] !== undefined) item.descripcion = values[3];
          if (values[4] !== undefined) item.servicios = typeof values[4] === 'string' ? JSON.parse(values[4]) : (values[4] || []);
          if (values[5] !== undefined) item.direccion = values[5];
          if (values[6] !== undefined) item.ciudad = values[6];
          if (values[7] !== undefined) item.telefono = values[7];
          if (values[8] !== undefined) item.whatsapp = values[8];
          if (values[9] !== undefined) item.email = values[9];
          if (values[10] !== undefined) item.imagen = values[10];
          if (values[11] !== undefined) item.link = values[11];
          if (values[12] !== undefined) item.lat = values[12];
          if (values[13] !== undefined) item.lng = values[13];
          if (values[14] !== undefined) item.destacado = Boolean(values[14]);
          if (values[15] !== undefined) item.destacado_solicitado = Boolean(values[15]);
          if (values[16] !== undefined) item.telefono_pago = values[16] || '';
        }
      }
      return [];
    }

    // UPDATE PRODUCTOS
    if (qUpper.includes('UPDATE PRODUCTOS')) {
      const id = values[values.length - 1];
      const item = mockData.productos.find(p => p.id === id);
      if (item) {
        if (qUpper.includes('SET ESTADO =') && values.length === 2) {
          item.estado = values[0];
        } else if (qUpper.includes('SET DESTACADO =') && values.length === 2) {
          item.destacado = Boolean(values[0]);
        } else {
          if (values[0] !== undefined) item.nombre = values[0];
          if (values[1] !== undefined) item.descripcion = values[1];
          if (values[2] !== undefined) item.precio = values[2];
          if (values[3] !== undefined) item.categoria = values[3];
          if (values[4] !== undefined) item.imagen = values[4];
          if (values[5] !== undefined) item.imagenes = typeof values[5] === 'string' ? JSON.parse(values[5]) : (values[5] || []);
          if (values[6] !== undefined) item.contacto = values[6];
          if (values[7] !== undefined) item.whatsapp = values[7];
          if (values[8] !== undefined) item.destacado = Boolean(values[8]);
          if (values[9] !== undefined) item.destacado_solicitado = Boolean(values[9]);
          if (values[10] !== undefined) item.telefono_pago = values[10] || '';
        }
      }
      return [];
    }

    // UPDATE FEEDBACKS
    if (qUpper.includes('UPDATE FEEDBACKS')) {
      const id = values[values.length - 1];
      const item = (mockData.feedbacks || []).find(f => f.id === id);
      if (item) {
        if (qUpper.includes('SET ESTADO =') && values.length === 2) {
          item.estado = values[0];
        }
      }
      return [];
    }

    // DELETE
    if (qUpper.includes('DELETE FROM TALLERES')) {
      const id = values[values.length - 1];
      mockData.talleres = mockData.talleres.filter(t => t.id !== id);
      return [];
    }
    if (qUpper.includes('DELETE FROM AUSPICIOS')) {
      const id = values[values.length - 1];
      mockData.auspicios = mockData.auspicios.filter(a => a.id !== id);
      return [];
    }
    if (qUpper.includes('DELETE FROM CATEGORIAS')) {
      const matchVal = values[0] !== undefined ? values[0] : values[values.length - 1];
      mockData.categorias = mockData.categorias.filter(c => String(c.id) !== String(matchVal) && c.nombre !== String(matchVal));
      return [];
    }
    if (qUpper.includes('DELETE FROM PRODUCTOS')) {
      const id = values[values.length - 1];
      mockData.productos = mockData.productos.filter(p => p.id !== id);
      return [];
    }
    if (qUpper.includes('DELETE FROM FEEDBACKS')) {
      const id = values[values.length - 1];
      mockData.feedbacks = (mockData.feedbacks || []).filter(f => f.id !== id);
      return [];
    }

    return [];
  };

  mockSql.transaction = async function(queries) {
    for (const q of queries) {
      if (typeof q === 'function') await q();
    }
    return [];
  };

  return mockSql;
}

function getDatabaseUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_URL_UNPOOLED ||
    process.env.STORAGE_URL ||
    process.env.STORAGE_POSTGRES_URL ||
    process.env.STORAGE_DATABASE_URL ||
    process.env.NEON_DATABASE_URL ||
    ''
  );
}

export function getSql() {
  const dbUrl = getDatabaseUrl();
  if (useMock || !dbUrl) {
    return createMockSql();
  }
  if (!sqlClient) {
    try {
      const realNeon = neon(dbUrl);
      const wrappedSql = async function(strings, ...values) {
        if (useMock) {
          const mock = createMockSql();
          return mock(strings, ...values);
        }
        try {
          return await realNeon(strings, ...values);
        } catch (err) {
          console.error('[TallerYa DB Error]:', err);
          console.log('[TallerYa DB] Conmutando a almacenamiento local en memoria temporal.');
          useMock = true;
          const mock = createMockSql();
          return mock(strings, ...values);
        }
      };

      wrappedSql.transaction = async function(queries) {
        if (useMock) {
          const mock = createMockSql();
          return mock.transaction(queries);
        }
        try {
          return await realNeon.transaction(queries);
        } catch (err) {
          console.log('[TallerYa DB] Conmutando a almacenamiento local en memoria.');
          useMock = true;
          const mock = createMockSql();
          return mock.transaction(queries);
        }
      };

      sqlClient = wrappedSql;
    } catch (e) {
      useMock = true;
      return createMockSql();
    }
  }
  return sqlClient;
}

let schemaReady = false;

export async function ensureSchema() {
  if (schemaReady) return;
  const sql = getSql();

  if (useMock) {
    schemaReady = true;
    return;
  }

  try {
    await sql.transaction([
      sql`
        CREATE TABLE IF NOT EXISTS talleres (
          id TEXT PRIMARY KEY,
          nombre TEXT NOT NULL,
          categoria TEXT DEFAULT '',
          ciudad TEXT DEFAULT '',
          direccion TEXT DEFAULT '',
          horario TEXT DEFAULT '',
          descripcion TEXT DEFAULT '',
          servicios JSONB DEFAULT '[]',
          telefono TEXT DEFAULT '',
          whatsapp TEXT DEFAULT '',
          email TEXT DEFAULT '',
          imagen TEXT DEFAULT '',
          lat DOUBLE PRECISION,
          lng DOUBLE PRECISION,
          estado TEXT DEFAULT 'pendiente',
          destacado BOOLEAN DEFAULT false,
          created_at TIMESTAMPTZ DEFAULT now()
        )
      `,
      sql`
        CREATE TABLE IF NOT EXISTS auspicios (
          id TEXT PRIMARY KEY,
          nombre TEXT NOT NULL,
          categoria TEXT DEFAULT '',
          horario TEXT DEFAULT '',
          descripcion TEXT DEFAULT '',
          servicios JSONB DEFAULT '[]',
          direccion TEXT DEFAULT '',
          ciudad TEXT DEFAULT '',
          telefono TEXT DEFAULT '',
          whatsapp TEXT DEFAULT '',
          email TEXT DEFAULT '',
          imagen TEXT DEFAULT '',
          link TEXT DEFAULT '',
          lat DOUBLE PRECISION,
          lng DOUBLE PRECISION,
          destacado BOOLEAN DEFAULT false,
          created_at TIMESTAMPTZ DEFAULT now()
        )
      `,
      sql`
        CREATE TABLE IF NOT EXISTS categorias (
          id SERIAL PRIMARY KEY,
          nombre TEXT UNIQUE NOT NULL,
          orden INT DEFAULT 0
        )
      `,
      sql`
        CREATE TABLE IF NOT EXISTS productos (
          id TEXT PRIMARY KEY,
          nombre TEXT NOT NULL,
          descripcion TEXT DEFAULT '',
          precio TEXT DEFAULT '',
          categoria TEXT DEFAULT '',
          imagen TEXT DEFAULT '',
          contacto TEXT DEFAULT '',
          whatsapp TEXT DEFAULT '',
          estado TEXT DEFAULT 'pendiente',
          destacado BOOLEAN DEFAULT false,
          folio SERIAL,
          created_at TIMESTAMPTZ DEFAULT now()
        )
      `,
      sql`
        CREATE TABLE IF NOT EXISTS feedbacks (
          id TEXT PRIMARY KEY,
          tipo TEXT DEFAULT 'valoracion',
          taller_id TEXT DEFAULT '',
          taller_nombre TEXT DEFAULT '',
          cliente_nombre TEXT NOT NULL,
          cliente_contacto TEXT DEFAULT '',
          calificacion INT DEFAULT 5,
          titulo TEXT DEFAULT '',
          mensaje TEXT NOT NULL,
          estado TEXT DEFAULT 'aprobado',
          created_at TIMESTAMPTZ DEFAULT now()
        )
      `,
      sql`
        CREATE TABLE IF NOT EXISTS visitas (
          id TEXT PRIMARY KEY,
          total INT DEFAULT 0,
          updated_at TIMESTAMPTZ DEFAULT now()
        )
      `,
      sql`ALTER TABLE talleres ADD COLUMN IF NOT EXISTS clics INT DEFAULT 0`,
      sql`ALTER TABLE talleres ADD COLUMN IF NOT EXISTS destacado_solicitado BOOLEAN DEFAULT false`,
      sql`ALTER TABLE talleres ADD COLUMN IF NOT EXISTS auspicio_solicitado BOOLEAN DEFAULT false`,
      sql`ALTER TABLE talleres ADD COLUMN IF NOT EXISTS telefono_pago TEXT DEFAULT ''`,
      sql`ALTER TABLE talleres ADD COLUMN IF NOT EXISTS folio SERIAL`,
      sql`ALTER TABLE talleres ADD COLUMN IF NOT EXISTS imagenes JSONB DEFAULT '[]'`,
      sql`ALTER TABLE talleres ADD COLUMN IF NOT EXISTS usuario_login TEXT DEFAULT ''`,
      sql`ALTER TABLE talleres ADD COLUMN IF NOT EXISTS usuario_pass TEXT DEFAULT ''`,
      sql`ALTER TABLE auspicios ADD COLUMN IF NOT EXISTS destacado_solicitado BOOLEAN DEFAULT false`,
      sql`ALTER TABLE auspicios ADD COLUMN IF NOT EXISTS telefono_pago TEXT DEFAULT ''`,
      sql`ALTER TABLE auspicios ADD COLUMN IF NOT EXISTS folio SERIAL`,
      sql`ALTER TABLE productos ADD COLUMN IF NOT EXISTS destacado_solicitado BOOLEAN DEFAULT false`,
      sql`ALTER TABLE productos ADD COLUMN IF NOT EXISTS telefono_pago TEXT DEFAULT ''`,
      sql`ALTER TABLE productos ADD COLUMN IF NOT EXISTS imagenes JSONB DEFAULT '[]'`
    ]);
  } catch (e) {
    useMock = true;
    schemaReady = true;
    return;
  }

  try {
    const countRows = await sql`SELECT COUNT(*)::int AS count FROM talleres`;
    if (countRows && countRows[0] && countRows[0].count === 0) {
      await seedTalleres(sql);
    }
    const countAusp = await sql`SELECT COUNT(*)::int AS count FROM auspicios`;
    if (countAusp && countAusp[0] && countAusp[0].count === 0) {
      await seedAuspicios(sql);
    }
    const countCat = await sql`SELECT COUNT(*)::int AS count FROM categorias`;
    if (countCat && countCat[0] && countCat[0].count === 0) {
      await seedCategorias(sql);
    }
    const countFb = await sql`SELECT COUNT(*)::int AS count FROM feedbacks`;
    if (countFb && countFb[0] && countFb[0].count === 0) {
      await seedFeedbacks(sql);
    }
    const countVisitas = await sql`SELECT COUNT(*)::int AS count FROM visitas`;
    if (countVisitas && countVisitas[0] && countVisitas[0].count === 0) {
      await sql`INSERT INTO visitas (id, total) VALUES ('global', 1850) ON CONFLICT (id) DO NOTHING`;
    }
  } catch (e) {
    useMock = true;
  }

  schemaReady = true;
}

async function seedTalleres(sql) {
  for (const t of mockData.talleres) {
    await sql`
      INSERT INTO talleres (id, nombre, categoria, ciudad, direccion, horario, descripcion, servicios, whatsapp, estado, destacado)
      VALUES (${t.id}, ${t.nombre}, ${t.categoria}, ${t.ciudad}, ${t.direccion}, ${t.horario}, ${t.descripcion}, ${JSON.stringify(t.servicios)}::jsonb, ${t.whatsapp}, 'aprobado', ${t.destacado})
      ON CONFLICT (id) DO NOTHING
    `;
  }
}

async function seedAuspicios(sql) {
  for (const s of mockData.auspicios) {
    await sql`
      INSERT INTO auspicios (id, nombre, categoria, descripcion)
      VALUES (${s.id}, ${s.nombre}, ${s.categoria}, ${s.descripcion})
      ON CONFLICT (id) DO NOTHING
    `;
  }
}

async function seedCategorias(sql) {
  for (const c of mockData.categorias) {
    await sql`
      INSERT INTO categorias (nombre, orden) VALUES (${c.nombre}, ${c.orden})
      ON CONFLICT (nombre) DO NOTHING
    `;
  }
}

async function seedFeedbacks(sql) {
  for (const f of mockData.feedbacks) {
    await sql`
      INSERT INTO feedbacks (id, tipo, taller_id, taller_nombre, cliente_nombre, cliente_contacto, calificacion, titulo, mensaje, estado, created_at)
      VALUES (${f.id}, ${f.tipo}, ${f.taller_id}, ${f.taller_nombre}, ${f.cliente_nombre}, ${f.cliente_contacto}, ${f.calificacion}, ${f.titulo}, ${f.mensaje}, ${f.estado}, ${f.created_at})
      ON CONFLICT (id) DO NOTHING
    `;
  }
}

