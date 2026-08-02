import { z } from "zod";
import { protectedProcedure, managerProcedure, router } from "../_core/trpc";
import * as db from "../db";

export const productsRouter = router({
  list: protectedProcedure
    .input(z.object({ search: z.string().optional(), categoryId: z.number().optional() }).optional())
    .query(({ input }) => db.getProducts(input?.search, input?.categoryId)),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => db.getProductById(input.id)),

  lowStock: protectedProcedure.query(() => db.getLowStockProducts()),

  categories: protectedProcedure.query(() => db.getProductCategories()),

  createCategory: managerProcedure
    .input(z.object({ name: z.string().min(2), description: z.string().optional() }))
    .mutation(({ input }) => db.createProductCategory(input)),

  updateCategory: managerProcedure
    .input(z.object({ id: z.number(), name: z.string().min(2).optional(), description: z.string().optional(), active: z.boolean().optional() }))
    .mutation(({ input }) => { const { id, ...data } = input; return db.updateProductCategory(id, data); }),

  deleteCategory: managerProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => db.deleteProductCategory(input.id)),

  create: managerProcedure
    .input(
      z.object({
        name: z.string().min(2),
        description: z.string().optional(),
        categoryId: z.number().optional(),
        sku: z.string().optional(),
        barcode: z.string().optional(),
        costPrice: z.number().min(0),
        salePrice: z.number().min(0),
        currentStock: z.number().int().min(0),
        minStock: z.number().int().min(0),
        unit: z.string().default("un"),
        purchaseUnit: z.string().default("un"),
        conversionFactor: z.number().int().min(1).default(1),
        supplierCode: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const id = await db.createProduct({
        ...input,
        costPrice: String(input.costPrice),
        salePrice: String(input.salePrice),
      });
      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name ?? "Sistema",
        action: "create",
        module: "products",
        targetId: id,
        details: `Produto criado: ${input.name}`,
      });
      return { id };
    }),

  update: managerProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        categoryId: z.number().optional(),
        sku: z.string().optional(),
        barcode: z.string().optional(),
        costPrice: z.number().optional(),
        salePrice: z.number().optional(),
        minStock: z.number().optional(),
        unit: z.string().optional(),
        purchaseUnit: z.string().optional(),
        conversionFactor: z.number().int().min(1).optional(),
        supplierCode: z.string().optional(),
        active: z.boolean().optional(),
      })
    )
    .mutation(({ input }) => {
      const { id, costPrice, salePrice, ...rest } = input;
      return db.updateProduct(id, {
        ...rest,
        costPrice: costPrice !== undefined ? String(costPrice) : undefined,
        salePrice: salePrice !== undefined ? String(salePrice) : undefined,
      });
    }),

  delete: managerProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => db.deleteProduct(input.id)),

  applyMinStockBulk: managerProcedure
    .input(
      z.object({
        items: z.array(
          z.object({
            productId: z.number().int().positive(),
            minStock: z.number().int().min(0),
          })
        ).min(1).max(500),
      })
    )
    .mutation(async ({ input }) => {
      let updated = 0;
      for (const item of input.items) {
        await db.updateProduct(item.productId, { minStock: item.minStock });
        updated++;
      }
      return { updated };
    }),

  addStockMovement: protectedProcedure
    .input(
      z.object({
        productId: z.number(),
        type: z.enum(["in", "out", "adjustment"]),
        quantity: z.number().int().positive(),
        previousStock: z.number().int(),
        newStock: z.number().int(),
        reason: z.string().optional(),
        purchaseDate: z.string().optional(),
        supplier: z.string().optional(),
        unitCost: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { purchaseDate, unitCost, ...rest } = input;
      await db.createStockMovement({
        ...rest,
        purchaseDate: purchaseDate ? new Date(purchaseDate) : undefined,
        unitCost: unitCost !== undefined ? String(unitCost) : undefined,
        userId: ctx.user.id,
      });
    }),

  stockMovements: protectedProcedure
    .input(z.object({ productId: z.number().optional() }).optional())
    .query(({ input }) => db.getStockMovements(input?.productId)),

  purchaseReport: protectedProcedure
    .input(z.object({ year: z.number(), month: z.number() }))
    .query(({ input }) => db.getMonthlyPurchaseReport(input.year, input.month)),
});
