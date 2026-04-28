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

  // Explorar tabela CLIENTES
  console.log('=== TABELA CLIENTES ===');
  const clienteCols = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'CLIENTES'
    ORDER BY ORDINAL_POSITION
  `);
  clienteCols.recordset.forEach(c => {
    const len = c.CHARACTER_MAXIMUM_LENGTH ? `(${c.CHARACTER_MAXIMUM_LENGTH})` : '';
    console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE}${len}`);
  });
  const clienteCount = await pool.request().query('SELECT COUNT(*) as total FROM CLIENTES');
  console.log(`  → Total: ${clienteCount.recordset[0].total} clientes`);
  
  // Amostra de clientes
  const clienteSample = await pool.request().query(`SELECT TOP 5 * FROM CLIENTES ORDER BY CLIENTE DESC`);
  console.log('\n  Amostra (5 últimos):');
  clienteSample.recordset.forEach(c => {
    console.log(`  ID=${c.CLIENTE} | Nome=${c.CLI_NOME} | Fone=${c.CLI_FONE || c.CLI_CELULAR || 'N/A'} | CPF=${c.CLI_CPF || 'N/A'} | Nasc=${c.CLI_DATA_NASCIMENTO || 'N/A'}`);
  });

  // Explorar tabela VENDA
  console.log('\n=== TABELA VENDA ===');
  const vendaCols = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'VENDA'
    ORDER BY ORDINAL_POSITION
  `);
  vendaCols.recordset.forEach(c => console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE}`));
  const vendaCount = await pool.request().query('SELECT COUNT(*) as total FROM VENDA');
  console.log(`  → Total: ${vendaCount.recordset[0].total} vendas`);

  // Vendas com cliente vinculado
  const vendasComCliente = await pool.request().query(`
    SELECT COUNT(*) as total FROM VENDA WHERE CLIENTE IS NOT NULL AND VEN_SITUACAO = 2
  `);
  console.log(`  → Vendas finalizadas com cliente: ${vendasComCliente.recordset[0].total}`);

  // Amostra de vendas com cliente
  console.log('\n  Amostra vendas com cliente (5 últimas):');
  const vendaSample = await pool.request().query(`
    SELECT TOP 5 v.VENDA, v.CLIENTE, v.VEN_DATA_FIM, v.VEN_TOTAL, v.VEN_SITUACAO,
           c.CLI_NOME, c.CLI_CELULAR, c.CLI_FONE, c.CLI_CPF
    FROM VENDA v
    LEFT JOIN CLIENTES c ON v.CLIENTE = c.CLIENTE
    WHERE v.CLIENTE IS NOT NULL AND v.VEN_SITUACAO = 2
    ORDER BY v.VENDA DESC
  `);
  vendaSample.recordset.forEach(v => {
    console.log(`  VendaID=${v.VENDA} | Cliente=${v.CLI_NOME} | Fone=${v.CLI_CELULAR || v.CLI_FONE || 'N/A'} | Total=R$${v.VEN_TOTAL} | Data=${v.VEN_DATA_FIM}`);
  });

  // Explorar tabela ITENS_VENDA ou similar
  console.log('\n=== TABELA ITENS_VENDA ===');
  try {
    const itensCols = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'ITENS_VENDA'
      ORDER BY ORDINAL_POSITION
    `);
    itensCols.recordset.forEach(c => console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE}`));
    const itensCount = await pool.request().query('SELECT COUNT(*) as total FROM ITENS_VENDA');
    console.log(`  → Total: ${itensCount.recordset[0].total} itens`);
  } catch(e) {
    console.log('  ⚠️ ITENS_VENDA não encontrada. Tentando ITENS_VENDAS...');
    try {
      const itensCols = await pool.request().query(`
        SELECT COLUMN_NAME, DATA_TYPE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'ITENS_VENDAS'
        ORDER BY ORDINAL_POSITION
      `);
      itensCols.recordset.forEach(c => console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE}`));
    } catch(e2) {
      console.log('  ⚠️ ITENS_VENDAS também não encontrada');
    }
  }

  // Verificar tabela CARTOES (usada na VENDA)
  console.log('\n=== TABELA CARTOES ===');
  const cartaoCols = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'CARTOES'
    ORDER BY ORDINAL_POSITION
  `);
  cartaoCols.recordset.forEach(c => console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE}`));
  const cartaoCount = await pool.request().query('SELECT COUNT(*) as total FROM CARTOES');
  console.log(`  → Total: ${cartaoCount.recordset[0].total} cartões`);
  
  // Amostra de cartões com cliente
  const cartaoSample = await pool.request().query(`
    SELECT TOP 5 * FROM CARTOES WHERE CLIENTE IS NOT NULL ORDER BY CARTAO DESC
  `);
  console.log('  Amostra:');
  cartaoSample.recordset.forEach(c => {
    console.log(`  CartaoID=${c.CARTAO} | ClienteID=${c.CLIENTE} | Nome=${c.CAR_NOME || 'N/A'} | Fone=${c.CAR_FONE || 'N/A'} | CPF=${c.CAR_CPF || 'N/A'}`);
  });

  await pool.close();
}

explore().catch(console.error);
