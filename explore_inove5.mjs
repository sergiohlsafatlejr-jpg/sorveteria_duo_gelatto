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

  // Explorar VENDAS
  console.log('=== TABELA VENDAS ===');
  const vendasCols = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'VENDAS' ORDER BY ORDINAL_POSITION
  `);
  vendasCols.recordset.forEach(c => console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE}`));
  const vendasCount = await pool.request().query('SELECT COUNT(*) as total FROM VENDAS');
  console.log(`  → Total: ${vendasCount.recordset[0].total}`);

  // Amostra de vendas
  const vendasSample = await pool.request().query(`SELECT TOP 3 * FROM VENDAS ORDER BY VENDA DESC`);
  console.log('\n  Amostra VENDAS (últimas 3):');
  vendasSample.recordset.forEach(v => console.log(JSON.stringify(v)));

  // Estatísticas de VENDAS
  const vendasStats = await pool.request().query(`
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN VEN_SITUACAO = 2 THEN 1 END) as finalizadas,
      COUNT(CASE WHEN VEN_SITUACAO = 2 AND PESSOA IS NOT NULL THEN 1 END) as com_pessoa,
      COUNT(CASE WHEN VEN_SITUACAO = 2 AND VEN_NOME_CLIENTE IS NOT NULL THEN 1 END) as com_nome,
      COUNT(CASE WHEN VEN_SITUACAO = 2 AND VEN_FONE_CLIENTE IS NOT NULL THEN 1 END) as com_fone,
      COUNT(CASE WHEN VEN_SITUACAO = 2 AND VEN_CPFCNPJ_CUPOM IS NOT NULL THEN 1 END) as com_cpf,
      MIN(VEN_DATA_FIM) as primeira,
      MAX(VEN_DATA_FIM) as ultima,
      SUM(CASE WHEN VEN_SITUACAO = 2 THEN VEN_TOTAL ELSE 0 END) as faturado
    FROM VENDAS
  `);
  console.log('\n  Estatísticas:');
  console.log(JSON.stringify(vendasStats.recordset[0], null, 2));

  // Vendas com PESSOA vinculada (últimas 5)
  console.log('\n  Vendas com PESSOA (últimas 5):');
  const vendasPessoa = await pool.request().query(`
    SELECT TOP 5 v.VENDA, v.PESSOA, v.VEN_DATA_FIM, v.VEN_TOTAL, v.VEN_SITUACAO,
           v.VEN_NOME_CLIENTE, v.VEN_FONE_CLIENTE, v.VEN_CPFCNPJ_CUPOM,
           p.PES_NOME, p.PES_TELEFONE, p.PES_RG_CPF
    FROM VENDAS v
    LEFT JOIN PESSOAS p ON v.PESSOA = p.PESSOA
    WHERE v.PESSOA IS NOT NULL AND v.VEN_SITUACAO = 2
    ORDER BY v.VENDA DESC
  `);
  vendasPessoa.recordset.forEach(v => console.log(JSON.stringify(v)));

  // Explorar ITENS_VENDAS
  console.log('\n=== TABELA ITENS_VENDAS ===');
  const itensCols = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'ITENS_VENDAS' ORDER BY ORDINAL_POSITION
  `);
  itensCols.recordset.forEach(c => console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE}`));
  const itensCount = await pool.request().query('SELECT COUNT(*) as total FROM ITENS_VENDAS');
  console.log(`  → Total: ${itensCount.recordset[0].total}`);

  // Amostra de itens
  const itensSample = await pool.request().query(`SELECT TOP 3 * FROM ITENS_VENDAS ORDER BY 1 DESC`);
  console.log('\n  Amostra ITENS_VENDAS:');
  itensSample.recordset.forEach(i => console.log(JSON.stringify(i)));

  // Explorar PAGAMENTOS_VENDAS
  console.log('\n=== TABELA PAGAMENTOS_VENDAS ===');
  const pgtosCols = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'PAGAMENTOS_VENDAS' ORDER BY ORDINAL_POSITION
  `);
  pgtosCols.recordState?.forEach(c => console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE}`));
  pgtosCols.recordset.forEach(c => console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE}`));
  const pgtosCount = await pool.request().query('SELECT COUNT(*) as total FROM PAGAMENTOS_VENDAS');
  console.log(`  → Total: ${pgtosCount.recordset[0].total}`);

  // Amostra de pagamentos
  const pgtosSample = await pool.request().query(`SELECT TOP 3 * FROM PAGAMENTOS_VENDAS ORDER BY 1 DESC`);
  console.log('\n  Amostra PAGAMENTOS_VENDAS:');
  pgtosSample.recordset.forEach(p => console.log(JSON.stringify(p)));

  // MOVIMENTOS_VENDAS
  console.log('\n=== TABELA MOVIMENTOS_VENDAS ===');
  const movCols = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'MOVIMENTOS_VENDAS' ORDER BY ORDINAL_POSITION
  `);
  movCols.recordset.forEach(c => console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE}`));
  const movCount = await pool.request().query('SELECT COUNT(*) as total FROM MOVIMENTOS_VENDAS');
  console.log(`  → Total: ${movCount.recordset[0].total}`);

  await pool.close();
}

explore().catch(console.error);
