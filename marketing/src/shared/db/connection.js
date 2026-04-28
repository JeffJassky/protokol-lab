import mongoose from 'mongoose';

// Own connection so the host app's default mongoose connection stays clean.
// Models are bound to this connection via `connection.model(...)`.
//
// `collectionPrefix` is applied per-model at definition time (see baseModel.js).
export function createDbConnection({ mongoUri, logger }) {
  const conn = mongoose.createConnection(mongoUri);

  conn.on('connected', () => logger.info?.({ uri: redactUri(mongoUri) }, '[marketing-admin] mongo connected'));
  conn.on('error', (err) => logger.error?.({ err: err.message }, '[marketing-admin] mongo error'));
  conn.on('disconnected', () => logger.warn?.('[marketing-admin] mongo disconnected'));

  return conn;
}

export async function waitForConnection(conn, timeoutMs = 10000) {
  if (conn.readyState === 1) return;
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('mongo connect timeout')), timeoutMs);
    conn.once('connected', () => {
      clearTimeout(t);
      resolve();
    });
    conn.once('error', (err) => {
      clearTimeout(t);
      reject(err);
    });
  });
}

function redactUri(uri) {
  return uri.replace(/\/\/[^@]+@/, '//<redacted>@');
}
