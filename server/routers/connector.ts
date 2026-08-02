import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import * as db from "../db";

export const connectorRouter = router({
  list: adminProcedure.query(() => db.getExternalConnectors()),

  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(2),
        host: z.string().min(2),
        port: z.number().default(3306),
        database: z.string().min(1),
        username: z.string().min(1),
        password: z.string().min(1),
        syncConfig: z.any().optional(),
      })
    )
    .mutation(({ input }) => db.createExternalConnector(input)),

  update: adminProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().optional(),
        host: z.string().optional(),
        port: z.number().optional(),
        database: z.string().optional(),
        username: z.string().optional(),
        password: z.string().optional(),
        active: z.boolean().optional(),
      })
    )
    .mutation(({ input }) => {
      const { id, ...rest } = input;
      return db.updateExternalConnector(id, rest);
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => db.deleteExternalConnector(input.id)),

  testConnection: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const connectors = await db.getExternalConnectors();
      const connector = connectors.find((c) => c.id === input.id);
      if (!connector) throw new TRPCError({ code: "NOT_FOUND" });

      try {
        const mysql2 = await import("mysql2/promise");
        const conn = await mysql2.createConnection({
          host: connector.host,
          port: connector.port,
          user: connector.username,
          password: connector.password,
          database: connector.database,
          connectTimeout: 5000,
        });
        await conn.ping();
        await conn.end();
        await db.updateExternalConnector(input.id, { syncStatus: "connected", lastSync: new Date() });
        return { success: true, message: "Conexão bem-sucedida!" };
      } catch (err: any) {
        await db.updateExternalConnector(input.id, { syncStatus: "error" });
        return { success: false, message: err.message ?? "Falha na conexão" };
      }
    }),
});
