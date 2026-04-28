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

  // Verificar quais colunas existem em VENDAS relacionadas a cliente
  console.log('=== COLUNAS DE VENDAS RELACIONADAS A CLIENTE ===');
  const vendasCols = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'VENDAS' ORDER BY ORDINAL_POSITION
  `);
  const clienteCols = vendasCols.recordset.filter(c => 
    c.COLUMN_NAME.toLowerCase().includes('client') || 
    c.COLUMN_NAME.toLowerCase().includes('pessoa') ||
    c.COLUMN_NAME.toLowerCase().includes('fone') ||
    c.COLUMN_NAME.toLowerCase().includes('cpf') ||
    c.COLUMN_NAME.toLowerCase().includes('nome')
  );
  clienteCols.forEach(c => console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE}`));

  // Estatísticas de vendas com cliente vinculado
  console.log('\n=== ESTATÍSTICAS DE VENDAS ===');
  const stats = await pool.request().query(`
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN VEN_SITUACAO = 2 THEN 1 END) as finalizadas,
      COUNT(CASE WHEN VEN_SITUACAO = 2 AND CLIENTE IS NOT NULL THEN 1 END) as com_cliente_id,
      COUNT(CASE WHEN VEN_SITUACAO = 2 AND VEN_NOME_CLIENTE IS NOT NULL THEN 1 END) as com_nome,
      COUNT(CASE WHEN VEN_SITUACAO = 2 AND VEN_FONE_CLIENTE IS NOT NULL THEN 1 END) as com_fone,
      COUNT(CASE WHEN VEN_SITUACAO = 2 AND VEN_CPFCNPJ_CUPOM IS NOT NULL THEN 1 END) as com_cpf,
      MIN(VEN_DATA_FIM) as primeira,
      MAX(VEN_DATA_FIM) as ultima,
      SUM(CASE WHEN VEN_SITUACAO = 2 THEN VEN_TOTAL ELSE 0 END) as faturado
    FROM VENDAS
  `);
  console.log(JSON.stringify(stats.recordset[0], null, 2));

  // Vendas com CLIENTE vinculado (últimas 5)
  console.log('\n=== VENDAS COM CLIENTE_ID (últimas 5) ===');
  const vendasCliente = await pool.request().query(`
    SELECT TOP 5 v.VENDA, v.CLIENTE, v.VEN_DATA_FIM, v.VEN_TOTAL, v.VEN_SITUACAO,
           v.VEN_NOME_CLIENTE, v.VEN_FONE_CLIENTE, v.VEN_CPFCNPJ_CUPOM
    FROM VENDAS v
    WHERE v.CLIENTE IS NOT NULL AND v.VEN_SITUACAO = 2
    ORDER BY v.VENDA DESC
  `);
  vendasCliente.recordset.forEach(v => console.log(JSON.stringify(v)));

  // Verificar tabela CLIENTES - qual coluna é a chave?
  console.log('\n=== CHAVE PRIMÁRIA DE CLIENTES ===');
  const clientePK = await pool.request().query(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE TABLE_NAME = 'CLIENTES' AND CONSTRAINT_NAME LIKE 'PK%'
  `);
  clientePK.recordset.forEach(c => console.log(`  PK: ${c.COLUMN_NAME}`));

  // Verificar se CLIENTES.PESSOA é FK para PESSOAS.PESSOA
  console.log('\n=== CLIENTES COM PESSOA JOIN ===');
  const clientesPessoa = await pool.request().query(`
    SELECT TOP 5 c.PESSOA, p.PES_NOME, p.PES_TELEFONE, p.PES_RG_CPF, p.PES_DATA_NASCIMENTO
    FROM CLIENTES c
    JOIN PESSOAS p ON c.PESSOA = p.PESSOA
    ORDER BY c.PESSOA DESC
  `);
  clientesPessoa.recordset.forEach(c => console.log(JSON.stringify(c)));

  // Verificar VENDAS com CLIENTE join CLIENTES join PESSOAS
  console.log('\n=== VENDAS COM CLIENTE + PESSOA (últimas 10 com cliente) ===');
  const vendasComPessoa = await pool.request().query(`
    SELECT TOP 10 
      v.VENDA, v.VEN_DATA_FIM, v.VEN_TOTAL, v.VEN_SITUACAO,
      v.CLIENTE, p.PES_NOME, p.PES_TELEFONE, p.PES_RG_CPF,
      v.VEN_NOME_CLIENTE, v.VEN_FONE_CLIENTE, v.VEN_CPFCNPJ_CUPOM
    FROM VENDAS v
    JOIN CLIENTES c ON v.CLIENTE = c.PESSOA
    JOIN PESSOAS p ON c.PESSOA = p.PESSOA
    WHERE v.VEN_SITUACAO = 2
    ORDER BY v.VENDA DESC
  `);
  vendasComPessoa.recordset.forEach(v => console.log(JSON.stringify(v)));

  // ITENS_VENDAS
  console.log('\n=== ITENS_VENDAS (colunas) ===');
  const itensCols = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'ITENS_VENDAS' ORDER BY ORDINAL_POSITION
  `);
  itensCols.recordset.forEach(c => console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE}`));
  const itensCount = await pool.request().query('SELECT COUNT(*) as total FROM ITENS_VENDAS');
  console.log(`  → Total: ${itensCount.recordset[0].total}`);

  // PAGAMENTOS_VENDAS
  console.log('\n=== PAGAMENTOS_VENDAS (colunas) ===');
  const pgtosCols = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'PAGAMENTOS_VENDAS' ORDER BY ORDINAL_POSITION
  `);
  pgtosCols.recordset.forEach(c => console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE}`));
  const pgtosCount = await pool.request().query('SELECT COUNT(*) as total FROM PAGAMENTOS_VENDAS');
  console.log(`  → Total: ${pgtosCount.recordset[0].total}`);

  // Amostra de PAGAMENTOS_VENDAS
  const pgtosSample = await pool.request().query(`SELECT TOP 3 * FROM PAGAMENTOS_VENDAS ORDER BY 1 DESC`);
  console.log('\n  Amostra PAGAMENTOS_VENDAS:');
  pgtosSample.recordset.forEach(p => console.log(JSON.stringify(p)));

  await pool.close();
}

explore().catch(console.error);
