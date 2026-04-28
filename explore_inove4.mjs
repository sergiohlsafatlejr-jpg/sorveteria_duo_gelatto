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
  console.log('✅ Conectado\n');

  // Listar TODAS as tabelas do banco
  const allTables = await pool.request().query(`
    SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_TYPE = 'BASE TABLE'
    ORDER BY TABLE_NAME
  `);
  
  console.log('=== TODAS AS TABELAS ===');
  allTables.recordset.forEach(t => console.log(t.TABLE_NAME));

  // Procurar tabelas relacionadas a vendas/cupons/pedidos
  const vendaKeywords = ['VEND', 'CUPOM', 'PEDIDO', 'NOTA', 'CAIXA', 'MOVIMENTO', 'LANCAMENTO'];
  const vendaTables = allTables.recordset.filter(t => 
    vendaKeywords.some(k => t.TABLE_NAME.toUpperCase().includes(k))
  );
  
  console.log('\n=== TABELAS RELACIONADAS A VENDAS ===');
  vendaTables.forEach(t => console.log(t.TABLE_NAME));

  // Explorar cada tabela de venda encontrada
  for (const t of vendaTables.slice(0, 10)) {
    try {
      const count = await pool.request().query(`SELECT COUNT(*) as total FROM [${t.TABLE_NAME}]`);
      const cols = await pool.request().query(`
        SELECT TOP 10 COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = '${t.TABLE_NAME}' ORDER BY ORDINAL_POSITION
      `);
      console.log(`\n${t.TABLE_NAME} (${count.recordset[0].total} registros):`);
      cols.recordset.forEach(c => console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE}`));
    } catch(e) {
      console.log(`\n${t.TABLE_NAME}: ERRO - ${e.message}`);
    }
  }

  // Verificar CUPONS_FISCAIS que apareceu na lista inicial
  console.log('\n=== CUPONS_FISCAIS ===');
  try {
    const cols = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'CUPONS_FISCAIS' ORDER BY ORDINAL_POSITION
    `);
    cols.recordset.forEach(c => console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE}`));
    const count = await pool.request().query('SELECT COUNT(*) as total FROM CUPONS_FISCAIS');
    console.log(`  → Total: ${count.recordset[0].total}`);
    
    // Amostra
    const sample = await pool.request().query(`SELECT TOP 3 * FROM CUPONS_FISCAIS ORDER BY 1 DESC`);
    console.log('  Amostra:');
    sample.recordset.forEach(r => console.log(JSON.stringify(r)));
  } catch(e) {
    console.log('Erro CUPONS_FISCAIS:', e.message);
  }

  // Verificar CUPONS_FISCAIS_ITENS
  console.log('\n=== CUPONS_FISCAIS_ITENS ===');
  try {
    const cols = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'CUPONS_FISCAIS_ITENS' ORDER BY ORDINAL_POSITION
    `);
    cols.recordset.forEach(c => console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE}`));
    const count = await pool.request().query('SELECT COUNT(*) as total FROM CUPONS_FISCAIS_ITENS');
    console.log(`  → Total: ${count.recordset[0].total}`);
  } catch(e) {
    console.log('Erro CUPONS_FISCAIS_ITENS:', e.message);
  }

  // Verificar CAIXAS_FECHAMENTOS
  console.log('\n=== CAIXAS_FECHAMENTOS ===');
  try {
    const cols = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'CAIXAS_FECHAMENTOS' ORDER BY ORDINAL_POSITION
    `);
    cols.recordset.forEach(c => console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE}`));
    const count = await pool.request().query('SELECT COUNT(*) as total FROM CAIXAS_FECHAMENTOS');
    console.log(`  → Total: ${count.recordset[0].total}`);
  } catch(e) {
    console.log('Erro CAIXAS_FECHAMENTOS:', e.message);
  }

  // Verificar COMANDAS
  console.log('\n=== COMANDAS ===');
  try {
    const cols = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'COMANDAS' ORDER BY ORDINAL_POSITION
    `);
    cols.recordset.forEach(c => console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE}`));
    const count = await pool.request().query('SELECT COUNT(*) as total FROM COMANDAS');
    console.log(`  → Total: ${count.recordset[0].total}`);
    
    // Amostra de comandas
    const sample = await pool.request().query(`SELECT TOP 3 * FROM COMANDAS ORDER BY 1 DESC`);
    console.log('  Amostra:');
    sample.recordset.forEach(r => console.log(JSON.stringify(r)));
  } catch(e) {
    console.log('Erro COMANDAS:', e.message);
  }

  await pool.close();
}

explore().catch(console.error);
