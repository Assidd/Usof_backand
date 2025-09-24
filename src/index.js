'use strict';

const http = require('http');
const app  = require('./app');
const env  = require('./config/env');
const { getPool } = require('./config/db');

function shouldInitDb() {
  const raw = String(process.env.INIT_DB ?? env.INIT_DB ?? '').toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

async function maybeInitDb() {
  if (!shouldInitDb()) return;

  const mod = require('./db/init');
  const runInit =
    (typeof mod === 'function') ? mod :
    (mod && typeof mod.initDatabase === 'function') ? mod.initDatabase :
    (mod && typeof mod.init === 'function') ? mod.init :
    null;

  if (!runInit) {
    throw new TypeError('db/init.js must export a function (default) или { initDatabase }');
  }

  console.log('[bootstrap] INIT_DB=true → running DB init…');
  await runInit(); 
  console.log('[bootstrap] DB init done');
}

async function bootstrap() {
  await maybeInitDb();

  await getPool().query('SELECT 1');
  console.log('[bootstrap] DB connection OK');

  const host = env.HOST || '0.0.0.0';
  const port = Number(env.PORT || 3000);

  const server = http.createServer(app);
  server.listen(port, host, () => {
    console.log(`API listening on http://${host}:${port} (${env.NODE_ENV || 'dev'})`);
  });

  // graceful shutdown
  const shutdown = (sig) => () => {
    console.log(`${sig} received, shutting down…`);
    server.close(() => {
      getPool().end().then(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT',  shutdown('SIGINT'));
  process.on('SIGTERM', shutdown('SIGTERM'));

  process.on('unhandledRejection', (err) => console.error('UnhandledRejection:', err));
  process.on('uncaughtException',  (err) => console.error('UncaughtException:', err));
}

bootstrap().catch((e) => {
  console.error('Bootstrap failed:', e);
  process.exit(1);
});
