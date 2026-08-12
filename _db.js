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
      created_at: new Date().toISOString(), folio: 3
    }
  ],
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
  productos: []
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
    if (qUpper.includes('SELECT COALESCE(MAX(ORDEN), 0)::INT AS MAX FROM CATEGORIAS')) {
      const max = mockData.categorias.reduce((m, c) => Math.max(m, c.orden || 0), 0);
      return [{ max }];
    }

    // SELECT TALLERES
    if (qUpper.includes('FROM TALLERES')) {
      let result = [...mockData.talleres];
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
      return [...mockData.auspicios];
    }

    // SELECT CATEGORIAS
    if (qUpper.includes('FROM CATEGORIAS')) {
      return [...mockData.categorias].sort((a, b) => (a.orden || 0) - (b.orden || 0));
    }

    // SELECT PRODUCTOS
    if (qUpper.includes('FROM PRODUCTOS')) {
      let result = [...mockData.productos];
      if (qUpper.includes("ESTADO = 'APROBADO'")) {
        result = result.filter(p => p.estado === 'aprobado');
      } else if (values[0]) {
        result = result.filter(p => p.estado === values[0]);
      }
      return result;
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
      const folio = ++folioCounter;

      const item = { id, nombre, categoria, ciudad, direccion, horario, descripcion, servicios, telefono, whatsapp, email, imagen, imagenes, lat, lng, estado, destacado, destacado_solicitado, auspicio_solicitado, telefono_pago, created_at: new Date().toISOString(), folio };
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

    // UPDATE TALLERES
    if (qUpper.includes('UPDATE TALLERES')) {
      const id = values[values.length - 1];
      const item = mockData.talleres.find(t => t.id === id);
      if (item) {
        if (qUpper.includes('SET ESTADO =') && values.length === 2) {
          item.estado = values[0];
        } else if (qUpper.includes('SET DESTACADO =') && values.length === 2) {
          item.destacado = values[0];
        } else if (values.length >= 14) {
          // Full update from PATCH /api/talleres/[id]
          item.nombre = values[0];
          item.categoria = values[1];
          item.ciudad = values[2];
          item.direccion = values[3];
          item.horario = values[4];
          item.descripcion = values[5];
          item.servicios = typeof values[6] === 'string' ? JSON.parse(values[6]) : (values[6] || []);
          item.telefono = values[7];
          item.whatsapp = values[8];
          item.email = values[9];
          item.imagen = values[10];
          item.imagenes = typeof values[11] === 'string' ? JSON.parse(values[11]) : (values[11] || []);
          item.lat = values[12];
          item.lng = values[13];
          item.destacado_solicitado = Boolean(values[14]);
          item.auspicio_solicitado = Boolean(values[15]);
          item.telefono_pago = values[16] || '';
        }
      }
      return [];
    }

    // UPDATE AUSPICIOS
    if (qUpper.includes('UPDATE AUSPICIOS')) {
      const id = values[values.length - 1];
      const item = mockData.auspicios.find(a => a.id === id);
      if (item && qUpper.includes('SET DESTACADO =')) item.destacado = values[0];
      return [];
    }

    // UPDATE PRODUCTOS
    if (qUpper.includes('UPDATE PRODUCTOS')) {
      const id = values[values.length - 1];
      const item = mockData.productos.find(p => p.id === id);
      if (item) {
        if (qUpper.includes('SET ESTADO =')) item.estado = values[0];
        if (qUpper.includes('SET DESTACADO =')) item.destacado = values[0];
      }
      return [];
    }

    // DELETE
    if (qUpper.includes('DELETE FROM TALLERES')) {
      const id = values[0];
      mockData.talleres = mockData.talleres.filter(t => t.id !== id);
      return [];
    }
    if (qUpper.includes('DELETE FROM AUSPICIOS')) {
      const id = values[0];
      mockData.auspicios = mockData.auspicios.filter(a => a.id !== id);
      return [];
    }
    if (qUpper.includes('DELETE FROM CATEGORIAS')) {
      const id = values[0];
      mockData.categorias = mockData.categorias.filter(c => String(c.id) !== String(id));
      return [];
    }
    if (qUpper.includes('DELETE FROM PRODUCTOS')) {
      const id = values[0];
      mockData.productos = mockData.productos.filter(p => p.id !== id);
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

export function getSql() {
  if (useMock) return createMockSql();
  if (!sqlClient) {
    if (!process.env.DATABASE_URL) {
      console.warn('[AI Studio] DATABASE_URL no configurada. Usando base de datos en memoria.');
      useMock = true;
      return createMockSql();
    }
    try {
      sqlClient = neon(process.env.DATABASE_URL);
    } catch (e) {
      console.warn('[AI Studio] Error al conectar con Neon SQL. Usando base de datos en memoria.', e);
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

  try {
    if (useMock) {
      schemaReady = true;
      return;
    }
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
      sql`ALTER TABLE talleres ADD COLUMN IF NOT EXISTS destacado_solicitado BOOLEAN DEFAULT false`,
      sql`ALTER TABLE talleres ADD COLUMN IF NOT EXISTS auspicio_solicitado BOOLEAN DEFAULT false`,
      sql`ALTER TABLE talleres ADD COLUMN IF NOT EXISTS telefono_pago TEXT DEFAULT ''`,
      sql`ALTER TABLE talleres ADD COLUMN IF NOT EXISTS folio SERIAL`,
      sql`ALTER TABLE talleres ADD COLUMN IF NOT EXISTS imagenes JSONB DEFAULT '[]'`,
      sql`ALTER TABLE auspicios ADD COLUMN IF NOT EXISTS destacado_solicitado BOOLEAN DEFAULT false`,
      sql`ALTER TABLE auspicios ADD COLUMN IF NOT EXISTS telefono_pago TEXT DEFAULT ''`,
      sql`ALTER TABLE auspicios ADD COLUMN IF NOT EXISTS folio SERIAL`,
      sql`ALTER TABLE productos ADD COLUMN IF NOT EXISTS destacado_solicitado BOOLEAN DEFAULT false`,
      sql`ALTER TABLE productos ADD COLUMN IF NOT EXISTS telefono_pago TEXT DEFAULT ''`,
      sql`ALTER TABLE productos ADD COLUMN IF NOT EXISTS imagenes JSONB DEFAULT '[]'`
    ]);
  } catch (e) {
    console.warn('Error al ejecutar migraciones en Neon. Cambiando a modo mock en memoria:', e);
    useMock = true;
    schemaReady = true;
    return;
  }

  try {
    const countRows = await sql`SELECT COUNT(*)::int AS count FROM talleres`;
    if (countRows[0].count === 0) {
      await seedTalleres(sql);
    }
    const countAusp = await sql`SELECT COUNT(*)::int AS count FROM auspicios`;
    if (countAusp[0].count === 0) {
      await seedAuspicios(sql);
    }
    const countCat = await sql`SELECT COUNT(*)::int AS count FROM categorias`;
    if (countCat[0].count === 0) {
      await seedCategorias(sql);
    }
  } catch (e) {
    console.warn('Error seeding DB, falling back to mock:', e);
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
