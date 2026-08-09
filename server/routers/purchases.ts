import { z } from "zod";
import { protectedProcedure, managerProcedure, router } from "../_core/trpc";
import * as db from "../db.purchases";

export const purchasesRouter = router({
  suppliers: router({
    list: protectedProcedure
      .input(z.object({ search: z.string().optional() }).optional())
      .query(({ input }) => db.getSuppliers(input?.search)),
    
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getSupplierById(input.id)),
      
    create: managerProcedure
      .input(z.object({
        name: z.string().min(1),
        phone: z.string().optional(),
        whatsapp: z.string().optional(),
        email: z.string().email().optional().or(z.literal("")),
        cnpj: z.string().optional(),
        categories: z.any().optional(),
        deliveryDays: z.number().optional(),
        paymentTerms: z.string().optional(),
        notes: z.string().optional()
      }))
      .mutation(({ input }) => db.createSupplier(input)),
      
    update: managerProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        phone: z.string().optional(),
        whatsapp: z.string().optional(),
        email: z.string().email().optional().or(z.literal("")),
        cnpj: z.string().optional(),
        categories: z.any().optional(),
        deliveryDays: z.number().optional(),
        paymentTerms: z.string().optional(),
        notes: z.string().optional(),
        active: z.boolean().optional()
      }))
      .mutation(({ input }) => {
        const { id, ...data } = input;
        return db.updateSupplier(id, data);
      }),
      
    delete: managerProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => db.deleteSupplier(input.id))
  }),
  
  items: router({
    list: protectedProcedure
      .input(z.object({ search: z.string().optional(), category: z.string().optional() }).optional())
      .query(({ input }) => db.getOperationalItems(input?.search, input?.category)),
      
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getOperationalItemById(input.id)),
      
    lowStock: protectedProcedure.query(() => db.getLowStockOperationalItems()),
    
    create: managerProcedure
      .input(z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        category: z.enum(["limpeza", "guloseimas", "caldas", "descartaveis", "embalagens", "manutencao", "insumos"]),
        unit: z.string().default("un"),
        currentStock: z.string().optional(),
        minStock: z.string().optional(),
        referencePrice: z.string().optional(),
        preferredSupplierId: z.number().optional()
      }))
      .mutation(({ input }) => db.createOperationalItem(input)),
      
    update: managerProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        category: z.enum(["limpeza", "guloseimas", "caldas", "descartaveis", "embalagens", "manutencao", "insumos"]).optional(),
        unit: z.string().optional(),
        currentStock: z.string().optional(),
        minStock: z.string().optional(),
        referencePrice: z.string().optional(),
        preferredSupplierId: z.number().optional(),
        active: z.boolean().optional()
      }))
      .mutation(({ input }) => {
        const { id, ...data } = input;
        return db.updateOperationalItem(id, data);
      }),
      
    delete: managerProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => db.deleteOperationalItem(input.id))
  }),
  
  stock: router({
    movements: protectedProcedure
      .input(z.object({ itemId: z.number().optional(), type: z.string().optional(), limit: z.number().optional() }).optional())
      .query(({ input }) => db.getStockMovements(input?.itemId, input?.type, input?.limit)),
      
    registerConsumption: protectedProcedure
      .input(z.object({
        itemId: z.number(),
        quantity: z.number().positive(),
        reason: z.string().optional(),
        type: z.enum(["consumption", "loss"]).default("consumption")
      }))
      .mutation(({ input, ctx }) => db.registerStockMovement({ ...input, userId: ctx.user.id })),
      
    adjust: managerProcedure
      .input(z.object({
        itemId: z.number(),
        quantity: z.number(),
        reason: z.string().optional()
      }))
      .mutation(({ input, ctx }) => db.registerStockMovement({ ...input, type: "adjustment", userId: ctx.user.id }))
  }),
  
  orders: router({
    list: protectedProcedure
      .input(z.object({ status: z.string().optional() }).optional())
      .query(({ input }) => db.getPurchaseOrders(input?.status)),
      
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getPurchaseOrderById(input.id)),
      
    create: managerProcedure
      .input(z.object({
        supplierId: z.number().optional(),
        notes: z.string().optional(),
        items: z.array(z.object({
          itemId: z.number(),
          quantity: z.number().positive(),
          unit: z.string(),
          estimatedUnitPrice: z.number().optional()
        })).min(1)
      }))
      .mutation(({ input, ctx }) => {
        const { items, ...data } = input;
        return db.createPurchaseOrder({ ...data, status: "draft", requestedBy: ctx.user.id }, items);
      }),
      
    request: managerProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => db.updatePurchaseOrderStatus(input.id, "requested")),
      
    approve: managerProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input, ctx }) => db.updatePurchaseOrderStatus(input.id, "approved", { approvedBy: ctx.user.id })),
      
    reject: managerProcedure
      .input(z.object({ id: z.number(), reason: z.string() }))
      .mutation(({ input }) => db.updatePurchaseOrderStatus(input.id, "rejected", { rejectionReason: input.reason })),
      
    markPurchased: managerProcedure
      .input(z.object({
        id: z.number(),
        items: z.array(z.object({
          id: z.number(),
          itemId: z.number(),
          quantity: z.number(),
          unit: z.string(),
          actualUnitPrice: z.number()
        }))
      }))
      .mutation(async ({ input }) => {
        await db.updatePurchaseOrderItems(input.id, input.items);
        await db.updatePurchaseOrderStatus(input.id, "purchased");
      }),
      
    deliver: managerProcedure
      .input(z.object({
        id: z.number(),
        items: z.array(z.object({
          id: z.number(),
          actualUnitPrice: z.number(),
          actualQuantity: z.number()
        }))
      }))
      .mutation(({ input, ctx }) => db.deliverPurchaseOrder(input.id, input.items, ctx.user.id))
  }),
  
  templates: router({
    list: protectedProcedure.query(() => db.getPurchaseTemplates()),
    
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getPurchaseTemplateById(input.id)),
      
    create: managerProcedure
      .input(z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        category: z.string().optional(),
        items: z.any()
      }))
      .mutation(({ input }) => db.createPurchaseTemplate(input)),
      
    update: managerProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        category: z.string().optional(),
        items: z.any().optional(),
        active: z.boolean().optional()
      }))
      .mutation(({ input }) => {
        const { id, ...data } = input;
        return db.updatePurchaseTemplate(id, data);
      }),
      
    delete: managerProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => db.deletePurchaseTemplate(input.id)),
      
    generateOrder: managerProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input, ctx }) => db.generateOrderFromTemplate(input.id, ctx.user.id))
  }),
  
  dashboard: protectedProcedure.query(() => db.getPurchasesDashboard())
});
