import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { canAccessFinancialModule, isFinancialModuleKey, removeFinancialPermissions } from "../../shared/financial-access";

export const usersRouter = router({
  list: adminProcedure.query(() => db.getAllUsers()),

  updateRole: adminProcedure
    .input(z.object({ userId: z.number(), role: z.enum(["admin", "manager", "attendant", "user"]) }))
    .mutation(async ({ input, ctx }) => {
      await db.updateUserRole(input.userId, input.role);
      if (!canAccessFinancialModule(input.role)) {
        await db.revokeFinancialPermissions(input.userId);
      }
      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name ?? "Sistema",
        action: "update_role",
        module: "users",
        targetId: input.userId,
        details: `Role alterado para: ${input.role}`,
      });
    }),

  toggleActive: adminProcedure
    .input(z.object({ userId: z.number(), active: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      await db.toggleUserActive(input.userId, input.active);
      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name ?? "Sistema",
        action: input.active ? "activate" : "deactivate",
        module: "users",
        targetId: input.userId,
        details: `Usuário ${input.active ? "ativado" : "desativado"}`,
      });
    }),

  getPermissions: adminProcedure
    .input(z.object({ userId: z.number() }))
    .query(({ input }) => db.getUserPermissions(input.userId)),

  myPermissions: protectedProcedure.query(({ ctx }) => db.getUserPermissions(ctx.user.id)),

  setPermission: adminProcedure
    .input(
      z.object({
        userId: z.number(),
        module: z.string(),
        canView: z.boolean(),
        canCreate: z.boolean(),
        canEdit: z.boolean(),
        canDelete: z.boolean(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { userId, module, ...perms } = input;
      const targetUser = await db.getUserById(userId);
      if (!targetUser) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado." });
      if (!canAccessFinancialModule(targetUser.role) && isFinancialModuleKey(module) && Object.values(perms).some(Boolean)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Colaborador e Funcionário não podem receber acesso ao módulo Financeiro." });
      }
      await db.upsertUserPermission(userId, module, perms);
      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name ?? "Sistema",
        action: "update_permission",
        module: "users",
        targetId: userId,
        details: `Permissão do módulo '${module}' atualizada`,
      });
    }),

  setAllPermissions: adminProcedure
    .input(
      z.object({
        userId: z.number(),
        permissions: z.array(
          z.object({
            module: z.string(),
            canView: z.boolean(),
            canCreate: z.boolean(),
            canEdit: z.boolean(),
            canDelete: z.boolean(),
          })
        ),
        profileApplied: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const targetUser = await db.getUserById(input.userId);
      if (!targetUser) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado." });
      const permissions = canAccessFinancialModule(targetUser.role)
        ? input.permissions
        : removeFinancialPermissions(input.permissions);
      await db.upsertAllUserPermissions(input.userId, permissions);
      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name ?? "Sistema",
        action: "set_all_permissions",
        module: "users",
        targetId: input.userId,
        details: `Perfil de permissões aplicado: ${input.profileApplied ?? "customizado"} (${permissions.length} módulos; Financeiro restrito para não administradores)`,
      });
    }),

  auditLogs: adminProcedure
    .input(z.object({ limit: z.number().default(100) }))
    .query(({ input }) => db.getAuditLogs(input.limit)),
});
