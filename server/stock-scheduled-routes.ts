import { COOKIE_NAME } from "@shared/const";
import { isAxiosError } from "axios";
import { parse as parseCookie } from "cookie";
import { eq } from "drizzle-orm";
import { Router, type RequestHandler } from "express";
import { inoveConnectorConfig, stockScheduledJobs, type StockScheduledJob } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { notifyOwner } from "./_core/notification";
import { sdk } from "./_core/sdk";
import type { GetUserInfoWithJwtResponse } from "./_core/types/manusTypes";
import { detectBoxOpenings } from "./box-opening";
import { getDb } from "./db";
import { deductStockFromInoveSales } from "./stock-auto-deduction";

// Cast restrito ao campo cron da resposta oficial; não altera o SDK legado.
type CronUserInfo = GetUserInfoWithJwtResponse & { taskUid?: unknown };
type JobKey = StockScheduledJob["jobKey"];

class CronAuthorizationError extends Error {
  constructor(message: string, readonly status: 401 | 403) {
    super(message);
  }
}

function scheduledHandler(expectedJobKeys: readonly JobKey[], run: () => Promise<unknown>): RequestHandler {
  return async (req, res) => {
    let taskUid: string | undefined;
    let jobKey: JobKey | undefined;
    let phase = "auth";
    try {
      const token = parseCookie(req.headers.cookie ?? "")[COOKIE_NAME];
      const session = await sdk.verifySession(token);
      if (!session) throw new CronAuthorizationError("invalid-session", 401);
      if (!session.openId.startsWith("cron_")) {
        throw new CronAuthorizationError("cron-only", 403);
      }
      if (!ENV.appId) throw new Error("VITE_APP_ID não configurado");
      if (session.appId !== ENV.appId) throw new CronAuthorizationError("wrong-project", 403);

      // Nunca authenticateRequest/getUserByOpenId/upsertUser: cron não é usuário local.
      const userInfo = await sdk.getUserInfoWithJwt(token ?? "") as CronUserInfo;
      if (userInfo.projectId !== ENV.appId || userInfo.openId !== session.openId ||
          !userInfo.openId.startsWith("cron_")) {
        throw new CronAuthorizationError("invalid-cron-identity", 403);
      }
      if (typeof userInfo.taskUid !== "string" || !userInfo.taskUid.trim() ||
          userInfo.taskUid !== userInfo.taskUid.trim() || userInfo.taskUid.length > 65) {
        throw new CronAuthorizationError("missing-or-invalid-task-uid", 403);
      }
      taskUid = userInfo.taskUid;

      phase = "registry";
      const db = await getDb();
      if (!db) throw new Error("Banco indisponível");
      // Busca exclusivamente pelo UID autenticado, nunca por name ou pelo body.
      const [job] = await db.select().from(stockScheduledJobs)
        .where(eq(stockScheduledJobs.scheduleCronTaskUid, taskUid)).limit(1);
      if (!job) {
        res.json({ ok: true, skipped: "orphan", taskUid });
        return;
      }
      jobKey = job.jobKey;
      if (job.scheduleCronTaskUid !== taskUid || !expectedJobKeys.includes(jobKey)) {
        throw new CronAuthorizationError("wrong-job-registration", 403);
      }
      if (!job.enabled) throw new CronAuthorizationError("job-disabled", 403);

      phase = "connector";
      const [connector] = await db.select().from(inoveConnectorConfig).limit(1);
      if (!connector?.active) throw new Error("INOVE não conectado");

      phase = "execute";
      const result = await run();
      res.json({ ok: true, taskUid, jobKey, result });
    } catch (error) {
      // Rejeições de credenciais são 4xx; rede/DB/conector são 5xx para retry.
      const authStatus = phase === "auth" && isAxiosError(error) &&
        (error.response?.status === 401 || error.response?.status === 403)
        ? error.response.status : undefined;
      const status = error instanceof CronAuthorizationError ? error.status : authStatus ?? 500;
      const context = {
        url: req.path,
        taskUid: taskUid ?? null,
        jobKey: jobKey ?? null,
        expectedJobKeys,
        phase,
      };
      const message = error instanceof Error ? error.message : String(error);
      if (status >= 500) console.error("[scheduled/stock]", { error: message, context });
      res.status(status).json({
        ok: false,
        error: message,
        ...(status >= 500 ? { stack: error instanceof Error ? error.stack : undefined } : {}),
        context,
        timestamp: new Date().toISOString(),
      });
    }
  };
}

// Os serviços legados retornam estes dois erros como resultado em certos ramos.
// Converte também esse caso (inclusive corrida após preflight) em erro retryable.
function assertServiceAvailable(result: { message: string }) {
  if (result.message === "Banco indisponível" || result.message === "INOVE não conectado") {
    throw new Error(result.message);
  }
}

export const stockDeductionHandler = scheduledHandler(["stock-deduction"], async () => {
  const result = await deductStockFromInoveSales({ hoursBack: 24 });
  assertServiceAvailable(result);
  return result;
});

export const boxOpeningsHandler = scheduledHandler(["box-dia", "box-noite"], async () => {
  const result = await detectBoxOpenings({
    notify: async (title, content) => { await notifyOwner({ title, content }); },
  });
  assertServiceAvailable(result);
  return result;
});

export const stockScheduledRouter = Router();
stockScheduledRouter.post("/api/scheduled/stock-deduction", stockDeductionHandler);
stockScheduledRouter.post("/api/scheduled/box-openings", boxOpeningsHandler);
