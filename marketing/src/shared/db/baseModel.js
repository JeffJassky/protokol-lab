// Helper for binding a schema to the suite's mongo connection w/ the
// configured collection prefix applied. All module models go through this
// so collection names stay consistent across the suite.

export function defineModel(conn, prefix, name, schema, baseName) {
  const collectionName = `${prefix}${baseName}`;
  return conn.model(name, schema, collectionName);
}
