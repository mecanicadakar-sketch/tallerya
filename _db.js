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
