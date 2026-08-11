export type OperationalSupplierCandidate = {
  id: number;
  name: string;
  cnpj: string | null;
};

function normalizeLegalEntityName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

export function findOperationalSupplierId(
  suppliers: OperationalSupplierCandidate[],
  name: string,
  cnpj: string,
): number | null {
  const normalizedCnpj = cnpj.replace(/\D/g, "");
  const normalizedName = normalizeLegalEntityName(name);
  const match = suppliers.find((supplier) => {
    const supplierCnpj = (supplier.cnpj ?? "").replace(/\D/g, "");
    if (normalizedCnpj && supplierCnpj === normalizedCnpj) return true;
    const candidateName = normalizeLegalEntityName(supplier.name);
    return Boolean(normalizedName && (candidateName === normalizedName || candidateName.includes(normalizedName)));
  });
  return match?.id ?? null;
}

export const HISTORICAL_IMPORT_STOCK_POLICY = Object.freeze({
  currentStockDelta: 0,
  createsStockMovement: false,
});

export function buildHistoricalBoxCatalogValues(description: string, unitPrice: number) {
  return {
    name: description,
    costPrice: Number(unitPrice).toFixed(2),
    currentStock: 0,
    minStock: 0,
    active: true,
  } as const;
}
