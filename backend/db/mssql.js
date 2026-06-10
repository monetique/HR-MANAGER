const mssql = require('mssql');

let pointagePool = null;

async function initPointageDB(retries = 5, delay = 5000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      pointagePool = await mssql.connect({
        user    : process.env.MSSQL_POINTAGE_USER,
        password: process.env.MSSQL_POINTAGE_PASSWORD,
        server  : process.env.MSSQL_POINTAGE_HOST,
        port    : parseInt(process.env.MSSQL_POINTAGE_PORT || '1433'),
        database: process.env.MSSQL_POINTAGE_DATABASE,
        options : { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
        pool    : { max: 5, min: 0, idleTimeoutMillis: 30000 },
        connectionTimeout: 15000,
      });
      console.log('✅ SQL Server Pointage connecté');
      return;
    } catch (err) {
      console.error(`❌ SQL Server Pointage (tentative ${attempt}/${retries}): ${err.message}`);
      if (attempt < retries) {
        console.log(`⏳ Retry dans ${delay / 1000}s...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  console.warn('⚠️  SQL Server Pointage non disponible — fonctionnalité désactivée');
}

function getPointagePool() { return pointagePool; }

module.exports = { initPointageDB, getPointagePool };
