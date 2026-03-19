import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Filter, X } from "lucide-react";

export interface FinFilters {
  search?: string;
  categoryId?: number | null;
  bankId?: number | null;
  status?: "all" | "paid" | "pending" | "overdue";
  dateFrom?: string;
  dateTo?: string;
  /** Filtro rápido de mês/ano: "YYYY-MM" */
  monthYear?: string;
}

interface FinFilterBarProps {
  filters: FinFilters;
  onChange: (f: FinFilters) => void;
  categories?: { id: number; name: string }[];
  banks?: { id: number; name: string }[];
  showStatus?: boolean;
  showBank?: boolean;
  showSearch?: boolean;
  showMonthYear?: boolean;
}

export function FinFilterBar({
  filters, onChange, categories = [], banks = [],
  showStatus = true, showBank = true, showSearch = true, showMonthYear = true,
}: FinFilterBarProps) {
  const hasFilters =
    filters.categoryId || filters.bankId ||
    (filters.status && filters.status !== "all") ||
    filters.dateFrom || filters.dateTo ||
    filters.search || filters.monthYear;

  const clear = () => onChange({ status: "all" });

  /** Quando o usuário escolhe mês/ano, preenche dateFrom/dateTo automaticamente */
  function handleMonthYear(val: string) {
    if (!val) {
      onChange({ ...filters, monthYear: undefined, dateFrom: undefined, dateTo: undefined });
      return;
    }
    const [year, month] = val.split("-").map(Number);
    const to = new Date(year, month, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    onChange({
      ...filters,
      monthYear: val,
      dateFrom: `${year}-${pad(month)}-01`,
      dateTo: `${year}-${pad(month)}-${pad(to.getDate())}`,
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-card/30 border border-border/30">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Filter className="h-3.5 w-3.5" />
        <span>Filtros:</span>
      </div>

      {showSearch && (
        <Input
          placeholder="Buscar..."
          value={filters.search ?? ""}
          onChange={e => onChange({ ...filters, search: e.target.value })}
          className="h-8 w-40 text-xs"
        />
      )}

      {/* Filtro rápido Mês/Ano */}
      {showMonthYear && (
        <Input
          type="month"
          value={filters.monthYear ?? ""}
          onChange={e => handleMonthYear(e.target.value)}
          className="h-8 w-36 text-xs"
          title="Filtrar por mês/ano"
        />
      )}

      {/* Filtro de intervalo de datas (oculto quando mês/ano está ativo) */}
      {!filters.monthYear && (
        <>
          <Input
            type="date"
            value={filters.dateFrom ?? ""}
            onChange={e => onChange({ ...filters, dateFrom: e.target.value })}
            className="h-8 w-36 text-xs"
            placeholder="De"
          />
          <Input
            type="date"
            value={filters.dateTo ?? ""}
            onChange={e => onChange({ ...filters, dateTo: e.target.value })}
            className="h-8 w-36 text-xs"
            placeholder="Até"
          />
        </>
      )}

      {categories.length > 0 && (
        <Select
          value={filters.categoryId?.toString() ?? "all"}
          onValueChange={v => onChange({ ...filters, categoryId: v === "all" ? null : Number(v) })}
        >
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas categorias</SelectItem>
            {categories.map(c => (
              <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {showBank && banks.length > 0 && (
        <Select
          value={filters.bankId?.toString() ?? "all"}
          onValueChange={v => onChange({ ...filters, bankId: v === "all" ? null : Number(v) })}
        >
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue placeholder="Banco" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os bancos</SelectItem>
            {banks.map(b => (
              <SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {showStatus && (
        <Select
          value={filters.status ?? "all"}
          onValueChange={v => onChange({ ...filters, status: v as FinFilters["status"] })}
        >
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="paid">Pagos</SelectItem>
            <SelectItem value="pending">Pendentes</SelectItem>
            <SelectItem value="overdue">Vencidos</SelectItem>
          </SelectContent>
        </Select>
      )}

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clear} className="h-8 text-xs text-muted-foreground">
          <X className="h-3.5 w-3.5 mr-1" /> Limpar
        </Button>
      )}
    </div>
  );
}
