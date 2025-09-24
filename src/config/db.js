// config/db.js
const mysql = require('mysql2/promise');
const env = require('./env');

let pool;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: env.DB_HOST,
      port: env.DB_PORT,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      database: env.DB_NAME,
      waitForConnections: true,
      connectionLimit: env.DB_POOL_MAX,
      // пригодно для JSON/даты
      timezone: 'Z',
      dateStrings: true,
      decimalNumbers: true,
      supportBigNumbers: true,
      namedPlaceholders: true,
    });
  }
  return pool;
}

async function query(sql, params) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}

async function getConnection() {
  return getPool().getConnection();
}

module.exports = { getPool, query, getConnection };
