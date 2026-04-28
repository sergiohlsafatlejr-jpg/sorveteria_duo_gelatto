/**
 * Script para salvar as credenciais do INOVE no banco do sistema Duo Gelatto
 * Executa via: node seed_inove_config.mjs
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';

// Carregar variáveis de ambiente
try {
  dotenv.config({ path: '.env' });
} catch(e) {
  // ignorar
}

// Tentar pegar DATABASE_URL do ambiente
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL não encontrada no ambiente');
  console.log('Tentando ler do arquivo .env...');
  process.exit(1);
}

async function seedConfig() {
  console.log('Conectando ao banco MySQL do sistema...');
  const conn = await mysql.createConnection(DATABASE_URL);
  
  // Verificar se já existe configuração
  const [existing] = await conn.execute('SELECT id FROM inove_connector_config LIMIT 1');
  
  const config = {
    host: 'duo-urias.safatle.net.br',
    port: 55444,
    database: 'DUOGELATTO',
    username: 'sa',
    password: '548469351',
    syncIntervalMinutes: 5,
    active: false,
  };
  
  if (existing.length > 0) {
    const id = existing[0].id;
    await conn.execute(`
      UPDATE inove_connector_config SET
        host = ?, port = ?, \`database\` = ?, username = ?, password = ?,
        sync_interval_minutes = ?, updated_at = NOW()
      WHERE id = ?
    `, [config.host, config.port, config.database, config.username, config.password, config.syncIntervalMinutes, id]);
    console.log('✅ Configuração atualizada (ID:', id, ')');
  } else {
    await conn.execute(`
      INSERT INTO inove_connector_config (host, port, \`database\`, username, password, sync_interval_minutes, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `, [config.host, config.port, config.database, config.username, config.password, config.syncIntervalMinutes, config.active]);
    console.log('✅ Configuração inserida com sucesso!');
  }
  
  // Verificar o que foi salvo
  const [saved] = await conn.execute('SELECT id, host, port, `database`, username, active FROM inove_connector_config LIMIT 1');
  console.log('Configuração salva:', saved[0]);
  
  await conn.end();
}

seedConfig().catch(console.error);
