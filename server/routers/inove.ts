/**
 * Router: INOVE Connector
 * Gerencia a integração com o banco de dados do PDV INOVE.
 * Permite configurar as credenciais, testar a conexão, sincronizar vendas
 * e vincular automaticamente clientes para lançar pontos de fidelidade.
 */
import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  inoveConnectorConfig,
  inoveSyncLog,
  customers,
  customerPurchases,
  customerLoyaltyTokens,
} from "../../drizzle/schema";
import { eq, desc, sql } from "drizzle-orm";
import crypto from "crypto";

// Helper: gera token único para o link público de fidelidade
function generateLoyaltyToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// Helper: garante que o cliente tem um token público gerado
async function ensureLoyaltyToken(customerId: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const existing = await db
    .select()
    .from(customerLoyaltyTokens)
    .where(eq(customerLoyaltyTokens.customerId, customerId))
    .limit(1);
  if (existing.length > 0) return existing[0].token;
  const token = generateLoyaltyToken();
  await db.insert(customerLoyaltyTokens).values({ customerId, token });
  return token;
}

export const inoveRouter = router({
  // ── Configuração ──────────────────────────────────────────────────────────
  getConfig: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;
    const rows = await db.select().from(inoveConnectorConfig).limit(1);
    if (rows.length === 0) return null;
    // Ocultar a senha na resposta
    const { password: _pw, ...safe } = rows[0];
    return { ...safe, passwordSet: !!_pw };
  }),

  saveConfig: adminProcedure
    .input(
      z.object({
        host: z.string().min(1),
        port: z.number().int().min(1).max(65535).default(3306),
        database: z.string().min(1),
        username: z.string().min(1),
        password: z.string().min(1),
        syncIntervalMinutes: z.number().int().min(1).max(60).default(5),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const existing = await db.select({ id: inoveConnectorConfig.id }).from(inoveConnectorConfig).limit(1);
      if (existing.length > 0) {
        await db.update(inoveConnectorConfig).set({ ...input, updatedAt: new Date() }).where(eq(inoveConnectorConfig.id, existing[0].id));
      } else {
        await db.insert(inoveConnectorConfig).values({ ...input, active: false });
      }
      return { success: true };
    }),

  toggleActive: adminProcedure
    .input(z.object({ active: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.update(inoveConnectorConfig).set({ active: input.active, updatedAt: new Date() });
      return { success: true };
    }),

  // ── Teste de conexão ──────────────────────────────────────────────────────
  testConnection: adminProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");
    const rows = await db.select().from(inoveConnectorConfig).limit(1);
    if (rows.length === 0) return { success: false, message: "Nenhuma configuração salva. Configure o conector primeiro." };
    const config = rows[0];
    // Tenta conectar ao banco do INOVE via mysql2
    try {
      const mysql = await import("mysql2/promise");
      const conn = await mysql.createConnection({
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.username,
        password: config.password,
        connectTimeout: 8000,
      });
      // Tenta listar as tabelas para confirmar acesso
      const [tables] = await conn.execute("SHOW TABLES");
      await conn.end();
      const tableList = (tables as { [key: string]: string }[]).map((r) => Object.values(r)[0]);
      await db.update(inoveConnectorConfig).set({
        lastSyncStatus: "success",
        lastSyncMessage: `Conexão OK. Tabelas encontradas: ${tableList.slice(0, 5).join(", ")}${tableList.length > 5 ? "..." : ""}`,
        updatedAt: new Date(),
      }).where(eq(inoveConnectorConfig.id, config.id));
      return { success: true, message: `Conexão estabelecida! ${tableList.length} tabelas encontradas.`, tables: tableList };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await db.update(inoveConnectorConfig).set({
        lastSyncStatus: "error",
        lastSyncMessage: msg,
        updatedAt: new Date(),
      }).where(eq(inoveConnectorConfig.id, config.id));
      return { success: false, message: `Erro de conexão: ${msg}` };
    }
  }),

  // ── Listar tabelas do INOVE (para mapear campos) ──────────────────────────
  listTables: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");
    const rows = await db.select().from(inoveConnectorConfig).limit(1);
    if (rows.length === 0) return { tables: [] };
    const config = rows[0];
    try {
      const mysql = await import("mysql2/promise");
      const conn = await mysql.createConnection({
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.username,
        password: config.password,
        connectTimeout: 8000,
      });
      const [tables] = await conn.execute("SHOW TABLES");
      await conn.end();
      const tableList = (tables as { [key: string]: string }[]).map((r) => Object.values(r)[0]);
      return { tables: tableList };
    } catch {
      return { tables: [] };
    }
  }),

  // ── Pré-visualizar colunas de uma tabela do INOVE ─────────────────────────
  previewTable: adminProcedure
    .input(z.object({ tableName: z.string().min(1) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const rows = await db.select().from(inoveConnectorConfig).limit(1);
      if (rows.length === 0) return { columns: [], sample: [] };
      const config = rows[0];
      try {
        const mysql = await import("mysql2/promise");
        const conn = await mysql.createConnection({
          host: config.host,
          port: config.port,
          database: config.database,
          user: config.username,
          password: config.password,
          connectTimeout: 8000,
        });
        const [cols] = await conn.execute(`DESCRIBE \`${input.tableName}\``);
        const [sample] = await conn.execute(`SELECT * FROM \`${input.tableName}\` LIMIT 3`);
        await conn.end();
        return { columns: cols as object[], sample: sample as object[] };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(msg);
      }
    }),

  // ── Sincronização manual de vendas ────────────────────────────────────────
  syncSales: adminProcedure
    .input(
      z.object({
        salesTableName: z.string().default("vendas"),        // nome da tabela de vendas no INOVE
        dateField: z.string().default("data_venda"),          // campo de data
        amountField: z.string().default("valor_total"),       // campo de valor total
        cpfField: z.string().default("cpf_cliente"),          // campo de CPF do cliente
        phoneField: z.string().default("telefone_cliente"),   // campo de telefone
        customerNameField: z.string().default("nome_cliente"),// campo de nome
        hoursBack: z.number().int().min(1).max(168).default(24), // sincronizar últimas N horas
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const configRows = await db.select().from(inoveConnectorConfig).limit(1);
      if (configRows.length === 0) throw new Error("Conector não configurado");
      const config = configRows[0];

      let salesFound = 0;
      let salesProcessed = 0;
      let customersLinked = 0;
      const errors: string[] = [];

      try {
        const mysql = await import("mysql2/promise");
        const conn = await mysql.createConnection({
          host: config.host,
          port: config.port,
          database: config.database,
          user: config.username,
          password: config.password,
          connectTimeout: 10000,
        });

        // Buscar vendas das últimas N horas
        const [salesRows] = await conn.execute(
          `SELECT * FROM \`${input.salesTableName}\`
           WHERE \`${input.dateField}\` >= DATE_SUB(NOW(), INTERVAL ? HOUR)
           ORDER BY \`${input.dateField}\` DESC
           LIMIT 500`,
          [input.hoursBack]
        );
        await conn.end();

        const sales = salesRows as Record<string, unknown>[];
        salesFound = sales.length;

        // Processar cada venda
        for (const sale of sales) {
          try {
            const amount = parseFloat(String(sale[input.amountField] ?? "0"));
            if (amount <= 0) continue;

            const cpf = String(sale[input.cpfField] ?? "").replace(/\D/g, "");
            const phone = String(sale[input.phoneField] ?? "").replace(/\D/g, "");
            const name = String(sale[input.customerNameField] ?? "");

            // Tentar vincular cliente por CPF ou telefone
            let customerId: number | null = null;
            if (cpf.length >= 11) {
              // Buscar por CPF nas notas do cliente (campo notes contém CPF)
              const [found] = await db
                .select({ id: customers.id })
                .from(customers)
                .where(sql`REPLACE(REPLACE(REPLACE(${customers.notes}, '.', ''), '-', ''), ' ', '') LIKE ${`%${cpf}%`}`)
                .limit(1);
              if (found) customerId = found.id;
            }
            if (!customerId && phone.length >= 10) {
              const [found] = await db
                .select({ id: customers.id })
                .from(customers)
                .where(sql`REPLACE(REPLACE(REPLACE(${customers.phone}, '(', ''), ')', ''), ' ', '') LIKE ${`%${phone.slice(-9)}%`}`)
                .limit(1);
              if (found) customerId = found.id;
            }

            // Se não encontrou e tem nome, criar cliente automaticamente
            if (!customerId && name.length > 2) {
              const [inserted] = await db.insert(customers).values({
                fullName: name,
                phone: phone.length >= 10 ? phone : undefined,
                notes: cpf.length >= 11 ? `CPF: ${cpf}` : undefined,
                totalPoints: 0,
                totalPurchases: "0.00",
                active: true,
              });
              customerId = (inserted as { insertId: number }).insertId;
              customersLinked++;
            }

            if (!customerId) continue;

            // Registrar compra
            await db.insert(customerPurchases).values({
              customerId,
              amount: String(amount.toFixed(2)),
              paymentMethod: "other",
              pointsEarned: 0,
              notes: `Importado do INOVE — ${String(sale[input.dateField] ?? "")}`,
            });

            // Atualizar totais do cliente
            await db.update(customers)
              .set({
                totalPurchases: sql`totalPurchases + ${amount}`,
                updatedAt: new Date(),
              })
              .where(eq(customers.id, customerId));

            // Garantir token de fidelidade
            await ensureLoyaltyToken(customerId);

            salesProcessed++;
          } catch (saleErr) {
            errors.push(String(saleErr));
          }
        }

        // Registrar log de sincronização
        await db.insert(inoveSyncLog).values({
          status: "success",
          salesFound,
          salesProcessed,
          customersLinked,
        });

        // Atualizar status do conector
        await db.update(inoveConnectorConfig).set({
          lastSyncAt: new Date(),
          lastSyncStatus: "success",
          lastSyncMessage: `${salesProcessed}/${salesFound} vendas processadas, ${customersLinked} clientes criados`,
          updatedAt: new Date(),
        }).where(eq(inoveConnectorConfig.id, config.id));

        return { success: true, salesFound, salesProcessed, customersLinked, errors: errors.slice(0, 5) };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        await db.insert(inoveSyncLog).values({ status: "error", salesFound: 0, salesProcessed: 0, customersLinked: 0, errorMessage: msg });
        await db.update(inoveConnectorConfig).set({ lastSyncStatus: "error", lastSyncMessage: msg, updatedAt: new Date() });
        throw new Error(msg);
      }
    }),

  // ── Histórico de sincronizações ───────────────────────────────────────────
  getSyncHistory: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(inoveSyncLog).orderBy(desc(inoveSyncLog.syncedAt)).limit(20);
  }),
});
