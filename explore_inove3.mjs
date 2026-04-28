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

  // Ver colunas da tabela CLIENTES
  console.log('=== COLUNAS DE CLIENTES ===');
  const clienteCols = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'CLIENTES' ORDER BY ORDINAL_POSITION
  `);
  clienteCols.recordset.forEach(c => console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE}`));

  // Amostra de clientes
  console.log('\n=== AMOSTRA CLIENTES (TOP 5) ===');
  const clientes = await pool.request().query(`SELECT TOP 5 * FROM CLIENTES ORDER BY PESSOA DESC`);
  clientes.recordset.forEach(c => console.log(JSON.stringify(c)));

  // Ver tabela PESSOAS (clientes podem estar em PESSOAS)
  console.log('\n=== COLUNAS DE PESSOAS ===');
  try {
    const pessoasCols = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'PESSOAS' ORDER BY ORDINAL_POSITION
    `);
    pessoasCols.recordset.forEach(c => console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE}`));
    const pessoasCount = await pool.request().query('SELECT COUNT(*) as total FROM PESSOAS');
    console.log(`  → Total: ${pessoasCount.recordset[0].total}`);
    
    // Amostra de pessoas
    const pessoas = await pool.request().query(`SELECT TOP 5 * FROM PESSOAS ORDER BY PESSOA DESC`);
    console.log('\n  Amostra PESSOAS:');
    pessoas.recordset.forEach(p => console.log(JSON.stringify(p)));
  } catch(e) {
    console.log('  PESSOAS não encontrada:', e.message);
  }

  // Ver tabela CARTOES
  console.log('\n=== COLUNAS DE CARTOES ===');
  const cartaoCols = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'CARTOES' ORDER BY ORDINAL_POSITION
  `);
  cartaoCols.recordset.forEach(c => console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE}`));
  const cartaoCount = await pool.request().query('SELECT COUNT(*) as total FROM CARTOES');
  console.log(`  → Total: ${cartaoCount.recordset[0].total}`);
  
  // Amostra de cartões
  const cartoes = await pool.request().query(`SELECT TOP 5 * FROM CARTOES ORDER BY CARTAO DESC`);
  console.log('\n  Amostra CARTOES:');
  cartoes.recordset.forEach(c => console.log(JSON.stringify(c)));

  // Verificar vendas com CARTAO vinculado
  console.log('\n=== VENDAS COM CARTAO (últimas 5) ===');
  const vendasCartao = await pool.request().query(`
    SELECT TOP 5 v.VENDA, v.VEN_DATA_FIM, v.VEN_TOTAL, v.VEN_SITUACAO,
           v.CARTAO, v.VEN_NOME_CLIENTE, v.VEN_FONE_CLIENTE, v.VEN_CPFCNPJ_CUPOM
    FROM VENDA v
    WHERE v.CARTAO IS NOT NULL AND v.VEN_SITUACAO = 2
    ORDER BY v.VENDA DESC
  `);
  vendasCartao.recordset.forEach(v => console.log(JSON.stringify(v)));

  // Verificar vendas com NOME_CLIENTE preenchido
  console.log('\n=== VENDAS COM NOME_CLIENTE (últimas 5) ===');
  const vendasNome = await pool.request().query(`
    SELECT TOP 5 v.VENDA, v.VEN_DATA_FIM, v.VEN_TOTAL, v.VEN_SITUACAO,
           v.VEN_NOME_CLIENTE, v.VEN_FONE_CLIENTE, v.VEN_CPFCNPJ_CUPOM
    FROM VENDA v
    WHERE v.VEN_NOME_CLIENTE IS NOT NULL AND v.VEN_SITUACAO = 2
    ORDER BY v.VENDA DESC
  `);
  vendasNome.recordset.forEach(v => console.log(JSON.stringify(v)));

  // Estatísticas gerais de vendas
  console.log('\n=== ESTATÍSTICAS DE VENDAS ===');
  const stats = await pool.request().query(`
    SELECT 
      COUNT(*) as total_vendas,
      COUNT(CASE WHEN VEN_SITUACAO = 2 THEN 1 END) as finalizadas,
      COUNT(CASE WHEN VEN_SITUACAO = 2 AND CARTAO IS NOT NULL THEN 1 END) as com_cartao,
      COUNT(CASE WHEN VEN_SITUACAO = 2 AND VEN_NOME_CLIENTE IS NOT NULL THEN 1 END) as com_nome,
      COUNT(CASE WHEN VEN_SITUACAO = 2 AND VEN_FONE_CLIENTE IS NOT NULL THEN 1 END) as com_fone,
      MIN(VEN_DATA_FIM) as primeira_venda,
      MAX(VEN_DATA_FIM) as ultima_venda,
      SUM(CASE WHEN VEN_SITUACAO = 2 THEN VEN_TOTAL ELSE 0 END) as total_faturado
    FROM VENDA
  `);
  console.log(JSON.stringify(stats.recordset[0], null, 2));

  await pool.close();
}

explore().catch(console.error);
