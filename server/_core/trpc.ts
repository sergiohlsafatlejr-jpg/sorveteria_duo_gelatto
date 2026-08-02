import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export function requireRole(role: "admin" | "manager", userRole: string) {
  const hierarchy = { admin: 3, manager: 2, attendant: 1, user: 0 };
  const userLevel = hierarchy[userRole as keyof typeof hierarchy] ?? 0;
  const required = hierarchy[role];
  if (userLevel < required) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
}

export const managerProcedure = protectedProcedure.use(({ ctx, next }) => {
  requireRole("manager", ctx.user.role);
  return next({ ctx });
});

export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') {
    throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
  }
  return next({ ctx });
});


