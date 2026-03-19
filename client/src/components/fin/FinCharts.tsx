import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

const shortBRL = (v: number) => {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}k`;
  return fmtBRL(v);
};

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border/50 bg-popover px-3 py-2 shadow-xl">
      <p className="text-sm font-medium mb-2">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-medium">{fmtBRL(entry.value)}</span>
        </div>
      ))}
    </div>
  );
};

// ─── Monthly Evolution Chart ──────────────────────────────────────────────────
interface MonthlyData {
  month: string;
  paid: number;
  pending: number;
  received: number;
}

export function FinMonthlyEvolutionChart({ data }: { data: MonthlyData[] }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/50 overflow-hidden">
      <div className="p-4 border-b border-border/50 bg-muted/20">
        <h3 className="text-sm font-semibold">Evolução Mensal de Pagamentos</h3>
      </div>
      <div className="p-4 h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorPago" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(142, 70%, 45%)" stopOpacity={0.4} />
                <stop offset="95%" stopColor="hsl(142, 70%, 45%)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorPendente" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(38, 92%, 50%)" stopOpacity={0.4} />
                <stop offset="95%" stopColor="hsl(38, 92%, 50%)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorRecebido" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(220, 70%, 55%)" stopOpacity={0.4} />
                <stop offset="95%" stopColor="hsl(220, 70%, 55%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={shortBRL} tick={{ fontSize: 10 }} width={60} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area type="monotone" dataKey="paid" name="Pago" stroke="hsl(142, 70%, 45%)" fill="url(#colorPago)" strokeWidth={2} />
            <Area type="monotone" dataKey="pending" name="Pendente" stroke="hsl(38, 92%, 50%)" fill="url(#colorPendente)" strokeWidth={2} />
            <Area type="monotone" dataKey="received" name="Recebido" stroke="hsl(220, 70%, 55%)" fill="url(#colorRecebido)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Category Pie Chart ───────────────────────────────────────────────────────
const COLORS = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316", "#84cc16"];

interface CategoryData {
  name: string;
  value: number;
}

export function FinCategoryChart({ data, title }: { data: CategoryData[]; title?: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/50 overflow-hidden">
      <div className="p-4 border-b border-border/50 bg-muted/20">
        <h3 className="text-sm font-semibold">{title ?? "Por Categoria"}</h3>
      </div>
      <div className="p-4 h-[260px]">
        {data.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Sem dados para exibir
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} dataKey="value">
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => fmtBRL(v)} />
              <Legend
                formatter={(value) => <span className="text-xs">{value}</span>}
                wrapperStyle={{ fontSize: 11 }}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

// ─── Cash Flow Bar Chart ──────────────────────────────────────────────────────
interface CashFlowData {
  month: string;
  receitas: number;
  despesas: number;
  saldo: number;
}

export function FinCashFlowChart({ data }: { data: CashFlowData[] }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/50 overflow-hidden">
      <div className="p-4 border-b border-border/50 bg-muted/20">
        <h3 className="text-sm font-semibold">Fluxo de Caixa</h3>
      </div>
      <div className="p-4 h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={shortBRL} tick={{ fontSize: 10 }} width={60} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="receitas" name="Receitas" fill="hsl(142, 70%, 45%)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="despesas" name="Despesas" fill="hsl(0, 70%, 55%)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
