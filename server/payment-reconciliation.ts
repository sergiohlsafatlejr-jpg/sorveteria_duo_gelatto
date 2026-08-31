export type PaymentMethodTotal = {
  forma: string;
  valorBruto: number;
  devolucao?: number;
};

export function normalizePaymentMethod(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

export function calculateNetPaymentAmount(method: string, grossAmount: number, refund = 0): number {
  const gross = Number(grossAmount) || 0;
  const returned = Number(refund) || 0;
  return normalizePaymentMethod(method) === "DINHEIRO" ? gross - returned : gross;
}

export function calculatePaymentTotals(rows: PaymentMethodTotal[]) {
  const methods = rows.map((row) => ({
    ...row,
    valorLiquido: calculateNetPaymentAmount(row.forma, row.valorBruto, row.devolucao),
  }));

  return {
    methods,
    totalBruto: methods.reduce((sum, row) => sum + row.valorBruto, 0),
    totalDevolucao: methods.reduce((sum, row) => sum + (Number(row.devolucao) || 0), 0),
    totalLiquido: methods.reduce((sum, row) => sum + row.valorLiquido, 0),
  };
}

export function calculateSalesReconciliation(grossSales: number, discounts: number, netReceived: number) {
  const gross = Number(grossSales) || 0;
  const discountAmount = Number(discounts) || 0;
  const received = Number(netReceived) || 0;
  const netSales = gross - discountAmount;

  return {
    grossSales: gross,
    discounts: discountAmount,
    netSales,
    netReceived: received,
    difference: received - netSales,
  };
}
