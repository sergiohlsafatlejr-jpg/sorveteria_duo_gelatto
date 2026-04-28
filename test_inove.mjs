import sql from 'mssql';

const config = {
  server: 'duo-urias.safatle.net.br',
  port: 55444,
  user: 'sa',
  password: '548469351',
  options: {
    encrypt: false,
    trustServerCertificate: true,
    connectTimeout: 15000,
    requestTimeout: 15000,
  },
};

async function testConnection() {
  console.log('Tentando conectar ao banco INOVE (SQL Server)...');
  console.log(`Host: ${config.server}:${config.port}`);
  
  try {
    const pool = await sql.connect(config);
    console.log('✅ Conexão estabelecida com sucesso!');
    
    // Listar bancos de dados disponíveis
    const dbResult = await pool.request().query('SELECT name FROM sys.databases ORDER BY name');
    console.log('\n📦 Bancos de dados disponíveis:');
    dbResult.recordset.forEach(r => console.log('  -', r.name));
    
    await pool.close();
  } catch (err) {
    console.error('❌ Erro na conexão:', err.message);
    console.error('Código:', err.code);
    
    // Tentar MySQL como fallback
    console.log('\n🔄 Tentando como MySQL...');
    try {
      const { createConnection } = await import('mysql2/promise');
      const conn = await createConnection({
        host: 'duo-urias.safatle.net.br',
        port: 55444,
        user: 'sa',
        password: '548469351',
        connectTimeout: 10000,
      });
      console.log('✅ Conexão MySQL estabelecida!');
      const [rows] = await conn.query('SHOW DATABASES');
      console.log('Bancos:', rows);
      await conn.end();
    } catch (mysqlErr) {
      console.error('❌ MySQL também falhou:', mysqlErr.message);
    }
  }
}

testConnection();
