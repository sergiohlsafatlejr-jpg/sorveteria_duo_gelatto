# Análise dos Relatórios — Sorveteria Duo Gelatto

## Relatórios Existentes (7 telas)

| # | Tela | Rota | Fonte de Dados | Abas/Seções |
|---|------|------|----------------|-------------|
| 1 | Reports.tsx (Módulo de Relatórios) | /reports | dashboard.*, inove.*, reports.*, customers.*, products.* | INOVE PDV, BI, Previsão, Meta, Vendas, Gerencial, Custo/Margem, Produtos, Clientes, Estoque (10 abas!) |
| 2 | GerencialReports.tsx (Relatórios Gerenciais) | /gerencial | inove.getCostVsSalesInove, inove.getTopProductsInove, inove.getPaymentMethodsInove, inove.getMonthlySalesEvolutionInove, reports.* | Estoque Gerencial, Custo x Venda, Mais Vendidos, Formas de Pagamento |
| 3 | SalesReport.tsx (Relatório de Vendas) | /sales/sales-report | inove.getSalesByPeriodInove, inove.getSalesByProduct, inove.getSalesByPaymentType, salesImport.* | Vendas da Semana, Vendas por Produto, Formas de Pagamento |
| 4 | InoveReports.tsx | /inove-reports | inove.* | Vendas por Hora, Vendas por Pagamento, Sincronizar Estoque |
| 5 | InoveCostMargin.tsx (Custo x Margem) | /inove/cost-margin | inove.getCostMarginFull | Tabela única sem filtro de mês |
| 6 | InoveManagerial.tsx (Relatórios Gerenciais INOVE) | /inove/managerial | inove.getManagerialReport | Mais Vendidos, Pagamentos, Custo x Venda, Estoque |
| 7 | FinWeekdayReport.tsx | /fin/weekday-report | — | Relatório Semanal (Pagar) |

## Problemas Identificados

### 1. DUPLICAÇÃO MASSIVA
- "Custo x Venda" aparece em 4 lugares: Reports.tsx (aba), GerencialReports.tsx (aba), InoveCostMargin.tsx (página), InoveManagerial.tsx (aba)
- "Mais Vendidos" aparece em 4 lugares: Reports.tsx, GerencialReports.tsx, SalesReport.tsx, InoveManagerial.tsx
- "Formas de Pagamento" aparece em 4 lugares: GerencialReports.tsx, SalesReport.tsx, InoveReports.tsx, InoveManagerial.tsx
- "Estoque" aparece em 3 lugares: Reports.tsx, GerencialReports.tsx, InoveManagerial.tsx

### 2. ATUALIZAÇÃO NÃO ACONTECENDO
- **InoveManagerial** (`getManagerialReport`): NÃO tem fallback local, NÃO tem refetchInterval, NÃO tem retry. Se o SQL Server do INOVE estiver offline, simplesmente mostra erro.
- **GerencialReports**: Usa endpoints com fallback local (getCostVsSalesInove, getTopProductsInove, etc.), mas o filtro de mês usa `trpc.reports.availableMonths` que busca do banco LOCAL (salesImports), não do INOVE. Se não há importações locais, o filtro fica vazio.
- **SalesReport**: Tem `refetchInterval: 5 * 60 * 1000` — é o único que atualiza periodicamente.

### 3. CUSTO x MARGEM ERRADO
- **InoveCostMargin** usa `getCostMarginFull` que:
  - Agrega últimos 12 MESES sem filtro de mês
  - Usa `PRO_CUSTO` atual (snapshot do momento) contra vendas históricas
  - Se o custo mudou ao longo do ano, a margem calculada está ERRADA
  - Não tem filtro de período — impossível ver margem de um mês específico
- **GerencialReports** usa `getCostVsSalesInove` que:
  - Suporta filtro por mês (referenceMonth)
  - Calcula margem corretamente para o período selecionado
  - Tem fallback local
  - É o endpoint CORRETO para análise de custo x margem

### 4. MENU LATERAL CONFUSO
- Seção "Vendas": Relatório de Vendas, Relatórios Gerenciais
- Seção "Relatórios": Módulo de Relatórios, Relatório de Vendas, Relatórios Gerenciais, Custo x Margem, Relatórios Gerenciais (duplicado!)
- O usuário não sabe onde ir para cada informação

## Proposta de Reorganização

### ELIMINAR duplicações — consolidar em 3 relatórios:

1. **Relatório de Vendas** (`/reports/sales`) — ÚNICO
   - Vendas por período (dia/semana/mês)
   - Vendas por produto (ranking)
   - Vendas por forma de pagamento
   - Vendas por hora do dia
   - Evolução mensal
   - Filtro: período customizável + mês de referência
   - Exportar Excel

2. **Relatório Financeiro** (`/reports/financial`) — ÚNICO
   - Custo x Margem por produto (com filtro de mês!)
   - CMV total vs Receita
   - Produtos sem custo cadastrado
   - Lucro bruto por produto
   - Usar endpoint `getCostVsSalesInove` (correto, com filtro de mês)
   - Exportar Excel

3. **Relatório Gerencial** (`/reports/managerial`) — ÚNICO
   - KPIs do mês (receita, ticket médio, qtd vendas)
   - Comparativo mês atual vs anterior
   - Top 10 produtos (receita + quantidade)
   - Formas de pagamento (pizza + evolução)
   - Filtro: mês de referência
   - Exportar Excel

### REMOVER:
- Reports.tsx (1213 linhas — substituído pelos 3 acima)
- InoveManagerial.tsx (duplica GerencialReports)
- InoveCostMargin.tsx (usa endpoint errado, substituído pelo Financeiro)
- InoveReports.tsx (abas absorvidas pelo Relatório de Vendas)

### MENU LATERAL:
```
📊 Relatórios
  ├── Vendas
  ├── Financeiro (Custo & Margem)
  └── Gerencial
```
