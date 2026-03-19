# Sistema de Gestão Sorveteria Duo Gelatto — TODO

## Banco de Dados / Schema
- [x] Tabela de clientes (customers)
- [x] Tabela de transações de pontos (points_transactions)
- [x] Tabela de regras de pontos (points_rules)
- [x] Tabela de produtos/mercadorias (products)
- [x] Tabela de categorias de produtos (product_categories)
- [x] Tabela de movimentações de estoque (stock_movements)
- [x] Tabela de vendas (sales)
- [x] Tabela de itens de venda (sale_items)
- [x] Tabela de permissões de usuário (user_permissions)
- [x] Tabela de log de auditoria (audit_logs)
- [x] Tabela de configurações do conector externo (external_connectors)
- [x] Tabela de notificações agendadas (scheduled_notifications)
- [x] Tabela de templates de notificação (notification_templates)
- [x] Migração executada com sucesso (pnpm db:push)

## Backend - Routers tRPC
- [x] Router de clientes (customers): CRUD completo
- [x] Router de pontos (points): adicionar, consultar, resgatar
- [x] Router de regras de pontos (pointsRules): configurar regras
- [x] Router de produtos (products): CRUD completo
- [x] Router de estoque (stock): movimentações, alertas
- [x] Router de vendas (sales): registrar, listar, relatórios
- [x] Router financeiro (finance): faturamento, análise
- [x] Router de usuários (users): CRUD, permissões
- [x] Router de permissões (permissions): gestão de roles
- [x] Router de conector externo (connector): sincronização MySQL externo
- [x] Router de notificações (notifications): templates, logs, envio WhatsApp/Instagram/Meta
- [x] Router de dashboard (dashboard): métricas e KPIs
- [x] Router de log de auditoria (auditLog)
- [x] Controle de acesso por função (admin, manager, attendant, user)
- [x] Correção de queries SQL compatíveis com only_full_group_by

## Frontend - Layout e Navegação
- [x] DashboardLayout com sidebar para sistema de gestão
- [x] Tema visual: cores da marca Duo Gelatto (roxo/rosa/laranja)
- [x] Navegação com controle de permissões por role
- [x] Página de acesso negado

## Frontend - Módulo de Clientes
- [x] Listagem de clientes com busca e filtros
- [x] Formulário de cadastro/edição de cliente
- [x] Campos: nome, data nascimento, CEP, telefone, valor compra
- [x] Visualização de pontos do cliente
- [x] Histórico de transações de pontos
- [x] Indicador de aniversariantes do dia/mês

## Frontend - Programa de Pontos
- [x] Configuração de regras de pontos
- [x] Adicionar pontos manualmente
- [x] Resgatar pontos
- [x] Histórico de pontos por cliente

## Frontend - Módulo de Estoque
- [x] Listagem de produtos com filtros
- [x] Formulário de cadastro/edição de produto
- [x] Controle de estoque (entrada/saída)
- [x] Alertas de estoque baixo
- [x] Relatório de movimentações

## Frontend - Módulo Financeiro
- [x] Registro de vendas
- [x] Relatório de faturamento por período
- [x] Análise de desempenho (gráficos)

## Frontend - Gestão de Usuários e Permissões
- [x] Listagem de usuários do sistema
- [x] Formulário de criação/edição de usuário
- [x] Atribuição de roles: admin, gerente, atendente
- [x] Log de auditoria de permissões
- [x] Notificação de acesso negado

## Frontend - Conector Banco Externo
- [x] Configuração de conexão MySQL externo
- [x] Sincronização manual de dados
- [x] Status da conexão
- [x] Log de sincronizações

## Frontend - Notificações WhatsApp/Instagram/Meta
- [x] Configuração de templates de mensagem
- [x] Envio automático de aniversário
- [x] Notificação de pontos acumulados
- [x] Envio de promoções
- [x] Histórico de notificações enviadas

## Frontend - Dashboard e Métricas
- [x] KPIs principais (vendas, clientes, estoque)
- [x] Gráfico de vendas por período
- [x] Gráfico de clientes ativos
- [x] Produtos mais vendidos
- [x] Clientes com mais pontos

## Frontend - Relatórios
- [x] Página de relatórios com análises completas
- [x] Gráficos de vendas, produtos, clientes e estoque

## Testes
- [x] Testes de autenticação (logout, me)
- [x] Testes de controle de acesso por função
- [x] Testes de programa de pontos
- [x] Testes de produtos
- [x] Testes de clientes
- [x] Testes de dashboard
- [x] Testes de notificações
- [x] Testes de conector externo
- [x] 23/23 testes passando

## Pendente (futuras iterações)
- [ ] Integração real com API WhatsApp Business (requer chave de API)
- [ ] Integração real com Instagram Graph API (requer chave de API)
- [ ] Integração real com Meta Ads API (requer chave de API)
- [ ] Sincronização automática agendada com banco externo
- [ ] Exportação de relatórios em PDF/Excel
- [ ] App mobile para atendentes

## Módulo Financeiro Completo (finance-buddy-70)

- [x] Schema: 9 tabelas financeiras (finCategories, finBanks, finTransactions, finReceivables, finCosts, finBankStatements, finRevenueForecast, finPaymentTypes, finReceivableTypes)
- [x] Backend: db.fin.ts com todas as funções de banco de dados
- [x] Router tRPC: fin.categories, fin.banks, fin.paymentTypes, fin.receivableTypes, fin.costs
- [x] Router tRPC: fin.transactions (CRUD + markPaid + markUnpaid + filtros)
- [x] Router tRPC: fin.receivables (CRUD + markReceived + markPending + filtros)
- [x] Router tRPC: fin.bankStatements (CRUD + filtros)
- [x] Router tRPC: fin.revenueForecast (upsert + delete + calendário)
- [x] Router tRPC: fin.dashboard (KPIs financeiros completos)
- [x] Componentes: FinKPICard, FinFilterBar, FinCharts (CashFlow + MonthlyEvolution)
- [x] Página: Painel Financeiro com KPIs e gráficos (/fin/dashboard)
- [x] Página: Contas a Pagar com CRUD e marcação de pagamento (/fin/payables)
- [x] Página: Contas a Receber com CRUD e marcação de recebimento (/fin/receivables)
- [x] Página: Extratos Bancários com entradas/saídas e conciliação (/fin/bank-statements)
- [x] Página: Gestão de Custos fixos e variáveis (/fin/costs)
- [x] Página: DRE - Demonstrativo de Resultado do Exercício (/fin/dre)
- [x] Página: Previsão de Faturamento com calendário interativo (/fin/forecast)
- [x] Página: Configurações Financeiras (categorias, bancos, tipos) (/fin/settings)
- [x] Menu lateral atualizado com grupo Financeiro completo (8 itens)
- [x] Rotas registradas no App.tsx
- [x] 23 testes passando

## Telas de Cadastro Dedicadas (solicitadas pelo usuário)

- [x] Tela de Cadastro de Produtos (/products-register) — CRUD completo
- [x] Tela de Cadastro de Categorias Financeiras (/fin/categories) — nome, tipo, cor
- [x] Tela de Cadastro de Custos (/fin/costs-register) — fixos e variáveis
- [x] Tela de Cadastro de Bancos (/fin/banks) — nome, saldo inicial, cor
- [x] Rotas registradas no App.tsx
- [x] Itens adicionados no DashboardLayout

## Reestruturação do Menu Lateral
- [x] Menu lateral com grupos colapsáveis (pastas + sub-itens)
- [x] Grupo Dashboard (item único)
- [x] Grupo Estoque: Cadastro de Produtos, Estoque, Relatórios de Estoque
- [x] Grupo Pontos: Cadastro de Clientes, Programa de Pontos, Regras de Pontos
- [x] Grupo Vendas: Vendas, Notificações
- [x] Grupo Financeiro: Painel, Contas a Pagar, Contas a Receber, Extratos, Custos, DRE, Previsão, Categorias, Bancos, Cadastro de Custos
- [x] Grupo Administração: Usuários, Conector Externo

## Badges de Notificação no Menu Lateral
- [x] Endpoint tRPC: alerts.counts — retorna overduePayables, overdueReceivables, lowStock, totalFinancial, total
- [x] Badge vermelho no grupo Financeiro com total de contas vencidas (pagar + receber)
- [x] Badge laranja no grupo Estoque com total de produtos com estoque baixo
- [x] Badge vermelho no sub-item "Contas a Pagar" com contagem específica
- [x] Badge vermelho no sub-item "Contas a Receber" com contagem específica
- [x] Badge laranja no sub-item "Estoque" com contagem específica
- [x] Badge total no cabeçalho quando sidebar colapsada
- [x] Badge total na barra mobile
- [x] Polling automático a cada 60 segundos para atualizar contagens

## Vinculação de Despesas a Custos
- [x] Campo costId já existe em finTransactions (FK para finCosts)
- [x] Endpoint tRPC: fin.costs.linkTransaction — vincular transação a custo
- [x] Endpoint tRPC: fin.costs.unlinkTransaction — desvincular transação de custo
- [x] Endpoint tRPC: fin.costs.getLinkedTransactions — listar despesas vinculadas a um custo
- [x] Endpoint tRPC: fin.costs.getUnlinkedTransactions — listar despesas sem custo vinculado
  - [x] Atualizar FinCostsRegister com painel de despesas vinculadas por custo
  - [x] Modal de seleção de despesas para vincular ao custo
  - [x] Exibir total gasto por custo com base nas despesas vinculadas

## Melhorias Módulo Financeiro (19/03)
- [x] Importação de Excel em Contas a Pagar (fin.transactions.importExcel)
- [x] Coluna "Custo" na tabela de Contas a Pagar
- [x] Expandir tela de Custos com mais campos (classificação: Administrativo/Operacional/Comercial/Financeiro/Outro)
- [x] Painel de despesas vinculadas dentro de cada custo (expandir linha)
- [x] Endpoint de importação de Excel no backend (fin.transactions.importExcel)
- [x] Campo costCategory adicionado ao schema e migrado (pnpm db:push)
- [x] 23/23 testes passando

## Botões de Voltar (19/03)
- [x] Componente BackButton reutilizável criado (client/src/components/BackButton.tsx)
- [x] BackButton adicionado em 21 telas: Customers, Dashboard, Finance, Notifications, Points, Products, ProductsRegister, Reports, Sales, Users, Connector
- [x] BackButton adicionado nas telas financeiras: FinPayables, FinReceivables, FinBankStatements, FinCosts, FinCostsRegister, FinDRE, FinSettings, FinanceDashboard, FinCategories, FinBanks
- [x] TypeScript 0 erros, 23/23 testes passando

## Filtro Mês/Ano e Fluxo de Caixa (19/03)
- [x] Filtro de mês/ano nas Contas a Pagar (frontend + backend)
- [x] Filtro de mês/ano nas Contas a Receber (frontend + backend)
- [x] Endpoint tRPC: fin.cashflow.monthly — projeção mensal cruzando pagar/receber
- [x] Tela Fluxo de Caixa (/fin/cashflow) com gráfico de barras + linha + tabela mensal
- [x] Rota e menu lateral atualizados
- [x] Exportação CSV do fluxo de caixa
- [x] TypeScript 0 erros, 23/23 testes passando

## Previsão de Faturamento com Calendário Inteligente (19/03)
- [x] API Open-Meteo (gratuita, sem chave) para Goiânia/GO
- [x] API BrasilAPI para feriados nacionais do ano
- [x] Endpoint backend: fin.forecastCalendar.getCalendar
- [x] Configuração de médias por tipo de dia (slider ajustável)
- [x] Fator de ajuste por clima: sol 100%, nublado -10%, chuva -30%, tempestade -44%
- [x] Tela de calendário visual com cores, ícones de clima e tooltip detalhado
- [x] Painel de KPIs com projeção total e contagem por tipo de dia
- [x] Tabela de resumo por semana
- [x] TypeScript 0 erros, 23/23 testes passando

## Faturamento Real + Acurácia + Alerta Chuva (19/03)
- [x] Tabela fin_daily_revenue no schema (data, realAmount, note, userId)
- [x] Migração pnpm db:push executada com sucesso
- [x] Endpoint: fin.forecastCalendar.saveRealRevenue (upsert por data)
- [x] Endpoint: fin.forecastCalendar.getRealRevenues (por mês)
- [x] Endpoint: fin.forecastCalendar.getAccuracyHistory (últimos 6 meses)
- [x] Endpoint: fin.forecastCalendar.getRainAlert (próximos 2 dias com chuva + impacto)
- [x] Modal de lançamento real no calendário (click no dia) com acurácia instantânea
- [x] Indicador visual de dias com real lançado (check verde no calendário)
- [x] Gráfico de acurácia: barras previsto vs realizado por mês (painel Acurácia)
- [x] Card de alerta de chuva no Dashboard Financeiro com impacto estimado
- [x] TypeScript 0 erros, 23/23 testes passando

## Programa de Pontos — Melhorias (19/03)
- [x] Tela dedicada de Regras de Pontos (/points-rules) separada dos Clientes
- [x] Campo "ativo" já existia na tabela pointsRules (sem migração necessária)
- [x] Botão inativar/reativar regra na tela de Regras de Pontos
- [x] Botão excluir regra com diálogo de confirmação
- [x] Badge visual: regra ativa (verde) / inativa (cinza + riscado)
- [x] Menu lateral: "Regras de Pontos" agora aponta para /points-rules
- [x] Dashboard: card "Clientes com Pontos" — top 8 com ranking e total de clientes com saldo
- [x] Endpoints: getAllRules, deleteRule, toggleRuleActive, topCustomersByPoints, customersWithPointsCount
- [x] TypeScript 0 erros, 23/23 testes passando

## Integração WhatsApp Z-API (19/03)
- [x] Tabelas: whatsapp_config, whatsapp_campaigns, whatsapp_logs no schema e migradas
- [x] Serviço Z-API (server/zapi.ts): sendWhatsAppMessage, checkZApiConnection, buildMessage, DEFAULT_TEMPLATES
- [x] Endpoints: getConfig, saveConfig, testConnection, getCampaigns, createCampaign, deleteCampaign, sendCampaign, getLogs, sendTest, getDefaultTemplates
- [x] Disparo automático ao pontuar (fire-and-forget no addPoints mutation)
- [x] Alerta de meta próxima (80%+) e meta atingida (notifyOnGoalNear, notifyOnGoalReached)
- [x] Tela unificada WhatsApp (/whatsapp) com 3 abas: Configuração, Campanhas, Histórico
- [x] Segmentação de clientes: todos, com pontos, sem pontos, próximos da meta
- [x] Mensagens personalizadas com variáveis: {{nome}}, {{pontos}}, {{saldo}}, {{meta}}, {{faltam}}, {{recompensa}}
- [x] Item WhatsApp no menu lateral (grupo Pontos)
- [x] TypeScript 0 erros, 23/23 testes passando

## Integração Instagram (19/03)
- [x] Tabela instagram_posts no schema e migrada (pnpm db:push)
- [x] Router instagramRouter com 8 endpoints: getAccountInfo, getRecentPosts, getPosts, createDraft, publishPost, deleteDraft, getPostInsights, syncMetrics
- [x] Integração via MCP do Instagram (manus-mcp-cli)
- [x] Tela Instagram (/instagram) com 3 abas: Feed, Rascunhos e Métricas
- [x] Card de conta conectada com seguidores e número de posts
- [x] Grid de posts recentes com hover de métricas e link para o Instagram
- [x] Modal de criação de rascunho com preview de imagem
- [x] Publicação via MCP com atualização de status no banco
- [x] Suporte a post, story e reels
- [x] KPIs totais: curtidas, alcance, impressões e comentários
- [x] Sincronização de métricas via botão
- [x] Item Instagram no menu lateral (grupo Pontos)
- [x] TypeScript 0 erros, 23/23 testes passando
