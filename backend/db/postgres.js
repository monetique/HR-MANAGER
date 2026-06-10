const { Pool } = require('pg');

const pool = new Pool({
  host    : process.env.PG_HOST     || 'localhost',
  port    : parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE || 'hr_manager',
  user    : process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  max     : 10,
  idleTimeoutMillis   : 30000,
  connectionTimeoutMillis: 5000,
  ssl     : process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

pool.on('error', err => console.error('❌ PostgreSQL pool error:', err.message));

pool.connect()
  .then(c => { console.log('✅ PostgreSQL connecté'); c.release(); })
  .catch(err => console.error('❌ PostgreSQL connexion échouée:', err.message));

async function query(sql, params) {
  try {
    return await pool.query(sql, params);
  } catch (err) {
    console.error('❌ Erreur PG:', err.message, '| SQL:', sql.slice(0, 80));
    throw err;
  }
}

module.exports = { pool, query };
