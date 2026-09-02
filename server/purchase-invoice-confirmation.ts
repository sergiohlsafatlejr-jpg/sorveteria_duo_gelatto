import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import {
  boxStock,
  boxStockMovements,
  operationalItems,
  operationalStockMovements,
  purchaseInvoiceItems,
  purchaseInvoices,
} from "../drizzle/schema";
import { getDb } from "./db";
import { isTenLiterItem } from "./purchase-invoice-extraction";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type OperationalCategory = "limpeza" | "guloseimas" | "caldas" | "descartaveis" | "embalagens" | "manutencao" | "insumos";

export function normalizeCatalogName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

export function toOperationalCategory(category: string): OperationalCategory {
  const supported: OperationalCategory[] = [
    "limpeza",
    "guloseimas",
    "caldas",
    "descartaveis",
    "embalagens",
    "manutencao",
    "insumos",
  ];
  return supported.includes(category as OperationalCategory) ? category as OperationalCategory : "insumos";
}

export async function confirmPurchaseInvoiceStock(db: Database, invoiceId: number, userId: number) {
  return db.transaction(async (tx) => {
    const invoices = await tx
      .select()
      .from(purchaseInvoices)
      .where(eq(purchaseInvoices.id, invoiceId))
      .limit(1)
      .for("update");
    const invoice = invoices[0];
    if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Nota fiscal não encontrada." });
    if (invoice.status === "confirmed") {
      throw new TRPCError({ code: "CONFLICT", message: "Esta nota já foi confirmada e não gerará entradas duplicadas." });
    }
    if (invoice.operationNature && invoice.operationNature !== "VENDA") {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: `Documento com natureza ${invoice.operationNature} não pode gerar entrada normal de estoque.`,
      });
    }
    if (invoice.status !== "extracted") {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Revise e concilie a nota antes de confirmar as entradas." });
    }

    const items = await tx
      .select()
      .from(purchaseInvoiceItems)
      .where(eq(purchaseInvoiceItems.invoiceId, invoiceId));
    if (items.length === 0) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A nota não possui itens para incorporar ao estoque." });
    }

    const operationalCatalog = (await tx
      .select({
        id: operationalItems.id,
        name: operationalItems.name,
        currentStock: operationalItems.currentStock,
      })
      .from(operationalItems)
      .where(eq(operationalItems.active, true)))
      .map((item) => ({ ...item, normalizedName: normalizeCatalogName(item.name) }));
    const boxCatalog = (await tx
      .select({
        id: boxStock.id,
        name: boxStock.name,
        currentStock: boxStock.currentStock,
      })
      .from(boxStock)
      .where(eq(boxStock.active, true)))
      .map((item) => ({ ...item, normalizedName: normalizeCatalogName(item.name) }));

    let operationalEntries = 0;
    let boxEntries = 0;
    const movementReference = `NF ${invoice.invoiceNumber ?? "s/n"} • ${invoice.supplierName ?? "Fornecedor não identificado"} • PDF`;

    for (const item of items) {
      const quantity = Number(item.quantity);
      const unitPrice = Number(item.unitPrice);
      if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Quantidade ou preço inválido no item ${item.description}.` });
      }

      if (isTenLiterItem(item.description)) {
        const integerQuantity = Math.round(quantity);
        if (Math.abs(integerQuantity - quantity) > 0.001) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `A caixa de 10 L ${item.description} precisa ter quantidade inteira.` });
        }
        const normalizedName = normalizeCatalogName(item.description);
        let box = boxCatalog.find((candidate) => candidate.normalizedName === normalizedName);
        if (!box) {
          const inserted = await tx.insert(boxStock).values({
            name: item.description,
            costPrice: unitPrice.toFixed(2),
            currentStock: 0,
            minStock: 2,
            active: true,
          }).$returningId();
          const boxId = inserted[0]?.id;
          if (!boxId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao criar a caixa de 10 L." });
          box = { id: boxId, name: item.description, currentStock: 0, normalizedName };
          boxCatalog.push(box);
        }
        const previousStock = box.currentStock;
        const newStock = previousStock + integerQuantity;
        await tx.insert(boxStockMovements).values({
          boxId: box.id,
          type: "entrada",
          quantity: integerQuantity,
          previousStock,
          newStock,
          notes: movementReference.slice(0, 500),
          userId,
        });
        await tx
          .update(boxStock)
          .set({ currentStock: newStock, costPrice: unitPrice.toFixed(2) })
          .where(eq(boxStock.id, box.id));
        box.currentStock = newStock;
        await tx
          .update(purchaseInvoiceItems)
          .set({ boxStockId: box.id, operationalItemId: null, linkStatus: "linked" })
          .where(eq(purchaseInvoiceItems.id, item.id));
        boxEntries++;
        continue;
      }

      const normalizedName = normalizeCatalogName(item.description);
      let operationalItem = operationalCatalog.find((candidate) => candidate.normalizedName === normalizedName);
      if (!operationalItem) {
        const inserted = await tx.insert(operationalItems).values({
          name: item.description,
          category: toOperationalCategory(item.category),
          unit: item.unit.toLowerCase(),
          currentStock: "0.00",
          minStock: "0.00",
          referencePrice: unitPrice.toFixed(2),
          preferredSupplierId: invoice.operationalSupplierId,
          active: true,
        }).$returningId();
        const operationalItemId = inserted[0]?.id;
        if (!operationalItemId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao criar item operacional." });
        operationalItem = { id: operationalItemId, name: item.description, currentStock: "0.00", normalizedName };
        operationalCatalog.push(operationalItem);
      }
      const previousStock = Number(operationalItem.currentStock);
      const newStock = previousStock + quantity;
      await tx.insert(operationalStockMovements).values({
        itemId: operationalItem.id,
        type: "in",
        quantity: quantity.toFixed(2),
        previousStock: previousStock.toFixed(2),
        newStock: newStock.toFixed(2),
        reason: movementReference.slice(0, 255),
        unitCost: unitPrice.toFixed(2),
        userId,
      });
      await tx
        .update(operationalItems)
        .set({
          currentStock: newStock.toFixed(2),
          referencePrice: unitPrice.toFixed(2),
          preferredSupplierId: invoice.operationalSupplierId,
        })
        .where(eq(operationalItems.id, operationalItem.id));
      operationalItem.currentStock = newStock.toFixed(2);
      await tx
        .update(purchaseInvoiceItems)
        .set({ operationalItemId: operationalItem.id, boxStockId: null, linkStatus: "linked" })
        .where(eq(purchaseInvoiceItems.id, item.id));
      operationalEntries++;
    }

    await tx
      .update(purchaseInvoices)
      .set({
        status: "confirmed",
        confirmedAt: new Date(),
        reviewedBy: invoice.reviewedBy ?? userId,
        reviewedAt: invoice.reviewedAt ?? new Date(),
      })
      .where(eq(purchaseInvoices.id, invoiceId));

    return { success: true, operationalEntries, boxEntries, totalItems: items.length };
  });
}
