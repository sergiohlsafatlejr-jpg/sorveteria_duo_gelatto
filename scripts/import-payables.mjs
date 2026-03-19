/**
 * Script de importação de contas a pagar do Excel para o banco MySQL
 * Uso: node scripts/import-payables.mjs
 */
import { readFileSync } from "fs";
import { createRequire } from "module";
import { createConnection } from "mysql2/promise";
import * as dotenv from "dotenv";

dotenv.config();

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) throw new Error("DATABASE_URL não encontrada no .env");

// Parse da DATABASE_URL: mysql://user:pass@host:port/db
const url = new URL(DB_URL);
const dbConfig = {
  host: url.hostname,
  port: parseInt(url.port) || 3306,
  user: url.username,
  password: url.password,
  database: url.pathname.replace("/", ""),
  ssl: { rejectUnauthorized: false },
};

console.log(`Conectando ao banco: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);

const conn = await createConnection(dbConfig);

// 1. Buscar o userId do owner (primeiro usuário admin)
const [users] = await conn.execute("SELECT id, name FROM users ORDER BY id LIMIT 1");
if (!users.length) throw new Error("Nenhum usuário encontrado no banco");
const userId = users[0].id;
console.log(`Usando userId: ${userId} (${users[0].name})`);

// 2. Ler o arquivo Excel
const wb = XLSX.readFile("/home/ubuntu/upload/contas-a-pagar-2026-03-19(1).xlsx");
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
console.log(`Linhas no Excel: ${rows.length}`);

// 3. Mapear categorias existentes ou criar novas
const [existingCats] = await conn.execute(
  "SELECT id, name FROM fin_categories WHERE userId = ?",
  [userId]
);
const catMap = new Map(existingCats.map(c => [c.name.toLowerCase().trim(), c.id]));
console.log(`Categorias existentes: ${existingCats.length}`);

async function getOrCreateCategory(name) {
  if (!name) return null;
  const key = name.toLowerCase().trim();
  if (catMap.has(key)) return catMap.get(key);
  const [result] = await conn.execute(
    "INSERT INTO fin_categories (userId, name, type, color) VALUES (?, ?, 'expense', ?)",
    [userId, name.trim(), "#6b7280"]
  );
  const newId = result.insertId;
  catMap.set(key, newId);
  console.log(`  → Categoria criada: "${name}" (id=${newId})`);
  return newId;
}

// 4. Mapear bancos existentes ou criar novos
const [existingBanks] = await conn.execute(
  "SELECT id, name FROM fin_banks WHERE userId = ?",
  [userId]
);
const bankMap = new Map(existingBanks.map(b => [b.name.toLowerCase().trim(), b.id]));
console.log(`Bancos existentes: ${existingBanks.length}`);

async function getOrCreateBank(name) {
  if (!name) return null;
  const key = name.toLowerCase().trim();
  if (bankMap.has(key)) return bankMap.get(key);
  const [result] = await conn.execute(
    "INSERT INTO fin_banks (userId, name, color, initialBalance) VALUES (?, ?, ?, '0')",
    [userId, name.trim(), "#6366f1"]
  );
  const newId = result.insertId;
  bankMap.set(key, newId);
  console.log(`  → Banco criado: "${name}" (id=${newId})`);
  return newId;
}

// 5. Mapear custos existentes
const [existingCosts] = await conn.execute(
  "SELECT id, name FROM fin_costs WHERE userId = ?",
  [userId]
);
const costMap = new Map(existingCosts.map(c => [c.name.toLowerCase().trim(), c.id]));
console.log(`Custos existentes: ${existingCosts.length}`);

async function getOrCreateCost(name) {
  if (!name) return null;
  const key = name.toLowerCase().trim();
  if (costMap.has(key)) return costMap.get(key);
  const [result] = await conn.execute(
    "INSERT INTO fin_costs (userId, name, amount, value, type, recurrence, dueDay) VALUES (?, ?, '0', '0', 'variable', 'once', 1)",
    [userId, name.trim()]
  );
  const newId = result.insertId;
  costMap.set(key, newId);
  console.log(`  → Custo criado: "${name}" (id=${newId})`);
  return newId;
}

// 6. Função para parsear data no formato DD/MM/YYYY
function parseDate(str) {
  if (!str) return new Date();
  const s = String(str).trim();
  // Formato DD/MM/YYYY
  const match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    return new Date(`${match[3]}-${match[2].padStart(2,"0")}-${match[1].padStart(2,"0")}T12:00:00Z`);
  }
  // Tentar parse direto
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  return new Date();
}

// 7. Importar as linhas
let imported = 0;
let skipped = 0;
let errors = 0;

console.log("\nIniciando importação...");

for (const row of rows) {
  const desc = String(row["Descrição"] || row["Descricao"] || "").trim();
  if (!desc) { skipped++; continue; }

  const amount = parseFloat(String(row["Valor"] || "0").replace(/[^0-9.,]/g, "").replace(",", ".")) || 0;
  const dueDateRaw = row["Vencimento"] || row["Data Vencimento"] || "";
  const dueDate = parseDate(dueDateRaw);
  const payDateRaw = row["Data Pagamento"] || "";
  const payDate = payDateRaw ? parseDate(payDateRaw) : null;
  const statusRaw = String(row["Status"] || "").toLowerCase().trim();
  const isPaid = ["pago", "paid", "sim", "yes", "1"].includes(statusRaw) ? 1 : 0;

  const catName = String(row["Categoria"] || "").trim();
  const bankName = String(row["Banco"] || "").trim();
  const costName = String(row["Custo"] || "").trim();

  try {
    const categoryId = await getOrCreateCategory(catName);
    const bankId = await getOrCreateBank(bankName);
    const costId = costName ? await getOrCreateCost(costName) : null;

    await conn.execute(
      `INSERT INTO fin_transactions 
       (userId, description, amount, dueDate, categoryId, bankId, costId, isPaid, paymentDate, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        userId,
        desc,
        amount.toFixed(2),
        dueDate,
        categoryId,
        bankId,
        costId,
        isPaid,
        isPaid && payDate ? payDate : null,
      ]
    );
    imported++;
    if (imported % 20 === 0) console.log(`  Importados: ${imported}/${rows.length}`);
  } catch (err) {
    console.error(`  ERRO na linha "${desc}":`, err.message);
    errors++;
  }
}

await conn.end();

console.log("\n=== RESULTADO ===");
console.log(`Total no Excel:  ${rows.length}`);
console.log(`Importados:      ${imported}`);
console.log(`Ignorados:       ${skipped}`);
console.log(`Erros:           ${errors}`);
console.log("=================");
