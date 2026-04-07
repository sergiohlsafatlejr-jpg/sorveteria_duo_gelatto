import "dotenv/config";
import mysql from "mysql2/promise";

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Verificar movimentações de NF-e duplicadas (mesmo motivo + mesma data)
const [dupes] = await conn.execute(`
  SELECT reason, DATE(purchaseDate) as date, COUNT(*) as cnt
  FROM stock_movements
  WHERE type = 'in' AND reason LIKE 'NF-e:%'
  GROUP BY reason, DATE(purchaseDate)
  HAVING cnt > 1
  ORDER BY cnt DESC
  LIMIT 20
`);

console.log("=== Duplicatas de NF-e encontradas:", dupes.length, "===");
if (dupes.length > 0) {
  dupes.forEach(r => console.log(`  ${r.cnt}x | ${r.date} | ${r.reason?.substring(0, 80)}`));
} else {
  console.log("  Nenhuma duplicata encontrada nas movimentações.");
}

// Total de movimentações NF-e
const [[totalRow]] = await conn.execute(`SELECT COUNT(*) as total FROM stock_movements WHERE type = 'in' AND reason LIKE 'NF-e:%'`);
console.log("\nTotal de movimentações NF-e no banco:", totalRow.total);

// Verificar se existe tabela de controle de NF-e
const [tables] = await conn.execute(`SHOW TABLES LIKE 'nfe%'`);
console.log("Tabelas NF-e existentes:", tables.map(t => Object.values(t)[0]));

// Verificar audit logs de NF-e
const [audits] = await conn.execute(`
  SELECT details, createdAt FROM audit_logs 
  WHERE module = 'nfe_import' 
  ORDER BY createdAt DESC LIMIT 10
`);
console.log("\nÚltimas importações de NF-e (audit log):", audits.length);
audits.forEach(a => console.log(`  ${a.createdAt?.toISOString?.()?.substring(0,10)} | ${a.details}`));

await conn.end();
