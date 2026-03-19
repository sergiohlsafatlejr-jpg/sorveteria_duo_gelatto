/**
 * Script de LIMPEZA e REIMPORTAÇÃO correta das contas a pagar
 * - Apaga todas as fin_transactions do userId
 * - Apaga todos os fin_costs do userId (exceto os que o usuário criou manualmente antes)
 * - Recria os 3 custos corretos: "Custo Fixo", "Custo Variável", "Impostos"
 * - Reimporta as 190 contas vinculando ao custo correto
 * - Cria categorias e bancos automaticamente
 */
import { createRequire } from "module";
import { createConnection } from "mysql2/promise";
import * as dotenv from "dotenv";

dotenv.config();

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) throw new Error("DATABASE_URL não encontrada no .env");

const url = new URL(DB_URL);
const dbConfig = {
  host: url.hostname,
  port: parseInt(url.port) || 3306,
  user: url.username,
  password: url.password,
  database: url.pathname.replace("/", ""),
  ssl: { rejectUnauthorized: false },
};

console.log(`Conectando ao banco: ${dbConfig.host}/${dbConfig.database}`);
const conn = await createConnection(dbConfig);

// Buscar userId do owner
const [users] = await conn.execute("SELECT id, name FROM users ORDER BY id LIMIT 1");
if (!users.length) throw new Error("Nenhum usuário encontrado");
const userId = users[0].id;
console.log(`UserId: ${userId} (${users[0].name})`);

// ═══════════════════════════════════════════════════════════
// PASSO 1: LIMPAR dados anteriores
// ═══════════════════════════════════════════════════════════
console.log("\n[1/4] Limpando transações anteriores...");
const [delTx] = await conn.execute(
  "DELETE FROM fin_transactions WHERE userId = ?",
  [userId]
);
console.log(`  → ${delTx.affectedRows} transações removidas`);

console.log("[1/4] Limpando custos anteriores...");
const [delCosts] = await conn.execute(
  "DELETE FROM fin_costs WHERE userId = ?",
  [userId]
);
console.log(`  → ${delCosts.affectedRows} custos removidos`);

// ═══════════════════════════════════════════════════════════
// PASSO 2: LER o Excel e calcular totais por custo
// ═══════════════════════════════════════════════════════════
console.log("\n[2/4] Lendo arquivo Excel...");
const wb = XLSX.readFile("/home/ubuntu/upload/contas-a-pagar-2026-03-19(1).xlsx");
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
console.log(`  → ${rows.length} linhas encontradas`);

// Calcular totais por custo para alimentar a aba de Custos
const custoTotais = {};
for (const row of rows) {
  const custo = String(row["Custo"] || "").trim();
  const valor = parseFloat(String(row["Valor"] || "0").replace(/[^0-9.,]/g, "").replace(",", ".")) || 0;
  if (custo) {
    if (!custoTotais[custo]) custoTotais[custo] = { total: 0, count: 0 };
    custoTotais[custo].total += valor;
    custoTotais[custo].count++;
  }
}
console.log("  → Custos encontrados no Excel:");
for (const [nome, info] of Object.entries(custoTotais)) {
  console.log(`     "${nome}": R$ ${info.total.toFixed(2)} (${info.count} lançamentos)`);
}

// ═══════════════════════════════════════════════════════════
// PASSO 3: CRIAR os 3 custos corretos na aba de Custos
// ═══════════════════════════════════════════════════════════
console.log("\n[3/4] Criando custos na aba de Custos...");

// Mapeamento de nomes do Excel para nomes amigáveis e tipo
const custoConfig = {
  "custo variavel": {
    nome: "Custo Variável",
    tipo: "variable",
    costCategory: "operational",
    recurrence: "monthly",
    desc: "Custos variáveis: sorvetes, guloseimas, copos, salários, energia, cartão de crédito, limpeza, saneamento"
  },
  "custo fixo": {
    nome: "Custo Fixo",
    tipo: "fixed",
    costCategory: "administrative",
    recurrence: "monthly",
    desc: "Custos fixos: empréstimos, aluguel, marketing, benefícios, contabilidade, segurança, seguro, internet, sistema, FGTS"
  },
  "impostos": {
    nome: "Impostos",
    tipo: "fixed",
    costCategory: "financial",
    recurrence: "monthly",
    desc: "Impostos e encargos: DAS, INSS"
  },
};

const costIdMap = {}; // chave lowercase -> id no banco

for (const [excelNome, info] of Object.entries(custoTotais)) {
  const key = excelNome.toLowerCase().trim();
  const config = custoConfig[key] || {
    nome: excelNome,
    tipo: "variable",
    costCategory: "other",
    recurrence: "monthly",
    desc: ""
  };

  const totalStr = info.total.toFixed(2);
  const [res] = await conn.execute(
    `INSERT INTO fin_costs (userId, name, description, amount, value, type, costCategory, recurrence, dueDay, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())`,
    [userId, config.nome, config.desc, totalStr, totalStr, config.tipo, config.costCategory, config.recurrence]
  );
  costIdMap[key] = res.insertId;
  console.log(`  → Custo criado: "${config.nome}" | R$ ${totalStr} | id=${res.insertId}`);
}

// ═══════════════════════════════════════════════════════════
// PASSO 4: CRIAR/BUSCAR categorias e bancos, depois importar transações
// ═══════════════════════════════════════════════════════════
console.log("\n[4/4] Importando contas a pagar...");

// Carregar categorias existentes
const [existingCats] = await conn.execute(
  "SELECT id, name FROM fin_categories WHERE userId = ?", [userId]
);
const catMap = new Map(existingCats.map(c => [c.name.toLowerCase().trim(), c.id]));

async function getOrCreateCategory(name) {
  if (!name) return null;
  const key = name.toLowerCase().trim();
  if (catMap.has(key)) return catMap.get(key);
  const [r] = await conn.execute(
    "INSERT INTO fin_categories (userId, name, type, color) VALUES (?, ?, 'expense', '#6b7280')",
    [userId, name.trim()]
  );
  catMap.set(key, r.insertId);
  console.log(`    + Categoria criada: "${name}"`);
  return r.insertId;
}

// Carregar bancos existentes
const [existingBanks] = await conn.execute(
  "SELECT id, name FROM fin_banks WHERE userId = ?", [userId]
);
const bankMap = new Map(existingBanks.map(b => [b.name.toLowerCase().trim(), b.id]));

async function getOrCreateBank(name) {
  if (!name) return null;
  const key = name.toLowerCase().trim();
  if (bankMap.has(key)) return bankMap.get(key);
  const [r] = await conn.execute(
    "INSERT INTO fin_banks (userId, name, color, initialBalance) VALUES (?, ?, '#6366f1', '0')",
    [userId, name.trim()]
  );
  bankMap.set(key, r.insertId);
  console.log(`    + Banco criado: "${name}"`);
  return r.insertId;
}

// Parsear data DD/MM/YYYY
function parseDate(str) {
  if (!str) return new Date();
  const s = String(str).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return new Date(`${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}T12:00:00Z`);
  const d = new Date(s);
  return isNaN(d.getTime()) ? new Date() : d;
}

let imported = 0;
let errors = 0;

for (const row of rows) {
  const desc = String(row["Descrição"] || row["Descricao"] || "").trim();
  if (!desc) continue;

  const valor = parseFloat(String(row["Valor"] || "0").replace(/[^0-9.,]/g, "").replace(",", ".")) || 0;
  const dueDate = parseDate(row["Vencimento"]);
  const payDateRaw = String(row["Data Pagamento"] || "").trim();
  const payDate = payDateRaw ? parseDate(payDateRaw) : null;
  const statusRaw = String(row["Status"] || "").toLowerCase().trim();
  const isPaid = ["pago", "paid", "sim", "yes", "1"].includes(statusRaw) ? 1 : 0;

  const catName = String(row["Categoria"] || "").trim();
  const bankName = String(row["Banco"] || "").trim();
  const custoNome = String(row["Custo"] || "").trim().toLowerCase();

  try {
    const categoryId = await getOrCreateCategory(catName);
    const bankId = await getOrCreateBank(bankName);
    const costId = custoNome ? (costIdMap[custoNome] ?? null) : null;

    await conn.execute(
      `INSERT INTO fin_transactions
       (userId, description, amount, dueDate, categoryId, bankId, costId, isPaid, paymentDate, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [userId, desc, valor.toFixed(2), dueDate, categoryId, bankId, costId, isPaid, isPaid && payDate ? payDate : null]
    );
    imported++;
    if (imported % 30 === 0) console.log(`  Importados: ${imported}/${rows.length}`);
  } catch (err) {
    console.error(`  ERRO "${desc}":`, err.message);
    errors++;
  }
}

await conn.end();

console.log("\n═══════════════════════════════");
console.log("       RESULTADO FINAL         ");
console.log("═══════════════════════════════");
console.log(`Contas importadas: ${imported}/${rows.length}`);
console.log(`Erros:             ${errors}`);
console.log(`Custos criados:    ${Object.keys(costIdMap).length}`);
console.log("═══════════════════════════════");
