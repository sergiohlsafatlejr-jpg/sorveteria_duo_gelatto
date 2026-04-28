import sql from 'mssql';

const config = {
  server: 'duo-urias.safatle.net.br',
  port: 55444,
  user: 'sa',
  password: '548469351',
  database: 'DUOGELATTO',
  options: {
    encrypt: false,
    trustServerCertificate: true,
    connectTimeout: 15000,
    requestTimeout: 30000,
  },
};

async function explore() {
  const pool = await sql.connect(config);
  console.log('✅ Conectado ao banco DUOGELATTO\n');

  // Listar todas as tabelas
  const tables = await pool.request().query(`
    SELECT TABLE_NAME, TABLE_TYPE
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_TYPE = 'BASE TABLE'
    ORDER BY TABLE_NAME
  `);
  console.log('📋 TABELAS DISPONÍVEIS:');
  tables.recordset.forEach(t => console.log('  -', t.TABLE_NAME));

  // Procurar tabelas de vendas, clientes, produtos
  const keywords = ['venda', 'cliente', 'produto', 'item', 'pedido', 'nota', 'caixa', 'cupom', 'fiscal'];
  const relevantTables = tables.recordset
    .filter(t => keywords.some(k => t.TABLE_NAME.toLowerCase().includes(k)))
    .map(t => t.TABLE_NAME);

  console.log('\n🎯 TABELAS RELEVANTES (vendas/clientes/produtos):');
  relevantTables.forEach(t => console.log('  -', t));

  // Explorar colunas das tabelas relevantes
  for (const tableName of relevantTables.slice(0, 15)) {
    try {
      const cols = await pool.request().query(`
        SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = '${tableName}'
        ORDER BY ORDINAL_POSITION
      `);
      console.log(`\n📊 ${tableName}:`);
      cols.recordset.forEach(c => {
        const len = c.CHARACTER_MAXIMUM_LENGTH ? `(${c.CHARACTER_MAXIMUM_LENGTH})` : '';
        console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE}${len}`);
      });

      // Contar registros
      const count = await pool.request().query(`SELECT COUNT(*) as total FROM [${tableName}]`);
      console.log(`  → Total de registros: ${count.recordset[0].total}`);
    } catch (e) {
      console.log(`  ⚠️ Erro ao explorar ${tableName}: ${e.message}`);
    }
  }

  // Mostrar amostra de vendas se existir
  const vendaTable = tables.recordset.find(t => 
    t.TABLE_NAME.toLowerCase() === 'venda' || 
    t.TABLE_NAME.toLowerCase() === 'vendas' ||
    t.TABLE_NAME.toLowerCase() === 'cupomfiscal'
  );
  
  if (vendaTable) {
    console.log(`\n🔍 AMOSTRA DE ${vendaTable.TABLE_NAME} (últimos 3 registros):`);
    try {
      const sample = await pool.request().query(`
        SELECT TOP 3 * FROM [${vendaTable.TABLE_NAME}] ORDER BY 1 DESC
      `);
      console.log(JSON.stringify(sample.recordset, null, 2));
    } catch (e) {
      console.log('Erro:', e.message);
    }
  }

  await pool.close();
}

explore().catch(console.error);
