import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";

export const salesRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        from: z.string().optional(),
        to: z.string().optional(),
        customerId: z.number().optional(),
      }).optional()
    )
    .query(({ input }) =>
      db.getSales(
        input?.from ? new Date(input.from) : undefined,
        input?.to ? new Date(input.to) : undefined,
        input?.customerId
      )
    ),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => db.getSaleById(input.id)),

  create: protectedProcedure
    .input(
      z.object({
        customerId: z.number().optional(),
        total: z.number().positive(),
        discount: z.number().min(0).default(0),
        finalTotal: z.number().positive(),
        paymentMethod: z.enum(["cash", "credit_card", "debit_card", "pix", "other"]),
        pointsEarned: z.number().int().min(0).default(0),
        pointsRedeemed: z.number().int().min(0).default(0),
        notes: z.string().optional(),
        items: z.array(
          z.object({
            productId: z.number(),
            productName: z.string(),
            quantity: z.number().int().positive(),
            unitPrice: z.number().positive(),
            subtotal: z.number().positive(),
          })
        ),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { items, ...saleData } = input;
      const saleId = await db.createSale(
        {
          ...saleData,
          userId: ctx.user.id,
          total: String(saleData.total),
          discount: String(saleData.discount),
          finalTotal: String(saleData.finalTotal),
        },
        items.map((i) => ({
          ...i,
          unitPrice: String(i.unitPrice),
          subtotal: String(i.subtotal),
        }))
      );

      // Update stock for each item
      for (const item of items) {
        const product = await db.getProductById(item.productId);
        if (product) {
          await db.createStockMovement({
            productId: item.productId,
            type: "sale",
            quantity: item.quantity,
            previousStock: product.currentStock,
            newStock: product.currentStock - item.quantity,
            reason: `Venda #${saleId}`,
            userId: ctx.user.id,
            saleId,
          });
        }
      }

      // Add points to customer
      if (input.customerId && input.pointsEarned > 0) {
        await db.addPointsTransaction({
          customerId: input.customerId,
          type: "earned",
          points: input.pointsEarned,
          purchaseAmount: String(input.finalTotal),
          description: `Pontos ganhos na venda #${saleId}`,
          userId: ctx.user.id,
        });
      }

      return { saleId };
    }),
});
