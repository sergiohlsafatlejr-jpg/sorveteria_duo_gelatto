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

## Instagram — IA e Agendamento (19/03)
- [ ] Campo scheduledAt na tabela instagram_posts (data/hora de publicação agendada)
- [ ] Endpoint: instagram.generateImage — gera imagem via IA com prompt da promoção
- [ ] Endpoint: instagram.schedulePost — salva data/hora de publicação no rascunho
- [ ] Endpoint: instagram.publishScheduled — publica posts cujo scheduledAt <= agora
- [ ] Modal de criação: botão "Gerar com IA" com campo de descrição da promoção
- [ ] Modal de criação: campo de data/hora para agendamento
- [ ] Lista de rascunhos: badge "Agendado" com data/hora
- [ ] Sugestões de horários de pico (11h, 19h, 21h)

## Instagram — IA e Agendamento (19/03)
- [x] Campos scheduledAt e aiPrompt adicionados à tabela instagram_posts e migrados
- [x] Endpoint: instagram.generateImage (IA via generateImage helper do servidor)
- [x] Endpoint: instagram.markPublished (marcar rascunho como publicado manualmente)
- [x] Modal de criação com botão "Gerar com IA" (modo IA ativo/inativo)
- [x] Seleção de estilo visual: Fotorrealista, Cartoon, Aquarela, Minimalista
- [x] Campo de agendamento com data/hora e atalhos de horários de pico (11h, 14h, 19h, 21h)
- [x] Badge "Agendado" e "IA" nos rascunhos da lista
- [x] Card de alerta de posts agendados pendentes
- [x] TypeScript 0 erros, 23/23 testes passando

## Correção Data Aniversário + Últimas Compras (19/03)
- [ ] Corrigir bug de fuso horário na exibição da data de aniversário (18/10 aparece como 17/10)
- [ ] Adicionar últimas 3 compras no card do cliente (data + valor)
- [ ] Adicionar média de gasto por visita no card do cliente
- [ ] Adicionar total de visitas no card do cliente

## Correção Bug Fuso Horário + Stats de Compras no Card do Cliente (19/03)
- [x] Bug corrigido: data de aniversário agora usa getUTCDate/getUTCMonth para evitar perda de 1 dia por UTC-3
- [x] Componente CustomerStats: exibe total de compras com botão expandir/recolher
- [x] Ao expandir: mostra ticket médio, número de visitas e últimas 5 compras com data, forma de pagamento e valor
- [x] Endpoint customers.getStats já existia no backend (getCustomerPurchaseStats)
- [x] Carregamento lazy: dados só são buscados quando o usuário expande o card
- [x] TypeScript 0 erros, 23/23 testes passando

## Registro de Compra no Card do Cliente (19/03)
- [ ] Botão "Registrar Compra" no card do cliente
- [ ] Modal com campo de valor da compra e forma de pagamento
- [ ] Ao salvar: cria registro na tabela de compras do cliente e calcula pontos automaticamente pela regra ativa
- [ ] Histórico de compras aparece no card expandível com data, valor e pontos ganhos
- [ ] Total de compras e ticket médio atualizados em tempo real

## Data de Compra no Estoque e Relatório Mensal (19/03)
- [x] Campo purchaseDate na tabela stock_movements (data da compra/entrada)
- [x] Migração pnpm db:push executada
- [x] Campo de data de compra no modal de entrada de estoque (Estoque > Movimentações)
- [x] Relatório mensal: quantas vezes cada item foi comprado no mês (tabela)
- [x] Filtro por mês/ano no relatório de compras por produto

## Fator de Conversão e Importação NF-e XML (19/03)
- [x] Campos purchaseUnit e conversionFactor no schema de products
- [x] Migração pnpm db:push executada
- [x] Modal de produto atualizado com campos de unidade de compra e fator de conversão
- [x] Procedure de parse de NF-e XML no backend (extrai itens, vincula produtos, calcula unidades)
- [x] Tela de importação NF-e XML com upload drag-and-drop
- [x] Revisão dos itens: tabela mostrando produto NF-e → produto cadastrado → qtd caixas → qtd unidades
- [x] Confirmar importação dá entrada automática no estoque com purchaseDate da NF-e

## Criação Automática de Produtos na Importação NF-e (19/03)
- [x] Backend: criar produto automaticamente se não encontrado na NF-e
- [x] Frontend: mostrar quais produtos serão criados vs vinculados antes de confirmar

## Correção Vínculo NF-e (19/03)
- [x] Remover busca por nome parcial — vincular apenas por supplierCode exato

## Bug Previsão de Faturamento (20/03)
- [x] Corrigir persistência dos valores de média na tela de previsão de faturamento

## Previsão de Faturamento — Duplicar e Bug de Data (31/03)
- [x] Corrigir bug de fuso horário nas datas dos itens de previsão (dia salvo a menos)
- [x] Selecionador de itens em Contas a Pagar com botão "Duplicar para próximo mês"
- [x] Selecionador de itens na Previsão de Faturamento com botão "Duplicar para próximo mês"
- [x] Endpoint backend: fin.transactions.duplicateToNextMonth
- [x] Endpoint backend: fin.forecastCalendar.duplicateDaysToNextMonth

## Bug Acesso Financeiro Usuário Clarissa (01/04)
- [x] Investigar por que Clarissa não vê dados de Contas a Pagar
- [x] Corrigir: dados financeiros agora são compartilhados por empresa (sem filtro por userId nas consultas)

## Página Meta de Gerência (01/04)
- [x] Tabela fin_goals no schema (cenários: label, targetRevenue, salary, notes)
- [x] Endpoint fin.goals.list, create, update, delete
- [x] Endpoint fin.goals.getMonthSummary (total contas a pagar do mês)
- [x] Tela FinGoals: total contas a pagar + tabela de cenários editáveis
- [x] Cálculo automático: faturamento necessário para cobrir contas + salário
- [x] Rota /fin/goals no App.tsx e link no menu Financeiro

## Popular Previsão de Faturamento a partir da Meta (01/04)
- [x] Analisar como finDailyRevenue e forecastSettings armazenam dados
- [x] Endpoint backend: populateForecastFromGoal distribui faturamento pelos dias com pesos
- [x] Botão na tela Meta de Gerência: "Popular Previsão" por cenário com diálogo de confirmação
- [x] Confirmação antes de sobrescrever dados existentes na previsão

## Bug DRE Resultado Líquido (01/04)
- [x] Investigar por que Custos Fixos (-R$188k) e Variáveis (-R$270k) estão absurdamente altos no DRE
- [x] Corrigir cálculo do DRE no backend (removida duplicação com fin_costs, usa apenas Contas a Pagar filtradas por mês)

## Registrar Compra no Card do Cliente (01/04)
- [ ] Botão "Registrar Compra" no card do cliente com valor e forma de pagamento
- [ ] Gerar pontos automaticamente pela regra ativa ao registrar compra
- [ ] Mostrar histórico de compras no card do cliente

## Comparativo Mensal por Categoria (01/04)
- [x] Endpoint backend: comparar dois meses por categoria de custo (fin.monthlyComparison.compare)
- [x] Tela FinMonthlyComparison: seletor de dois meses, tabela por categoria com variação %
- [x] Gráfico de barras lado a lado por categoria
- [x] Rota /fin/monthly-comparison e link no menu Financeiro

## Corrigir Popular Previsão — Gravar como Previsão, não como Real (01/04)
- [x] Corrigir populateForecastFromGoal para gravar em finRevenueForecasts (previsão) em vez de finDailyRevenue (valor real)
- [x] Valor real deve continuar sendo inserido manualmente pelo usuário no calendário
- [x] Calendário exibe: Meta (laranja, da Meta de Gerência) e Real (verde, inserido manualmente)
- [x] Modal mostra Meta do Dia vs Projeção por médias, acurácia calculada vs meta
- [x] KPI card de Meta do Mês exibido quando meta populada
- [x] Legenda atualizada com cor de meta

## Compartilhamento de Dados do Calendário entre Usuários (01/04)
- [x] finDailyRevenue: dados visíveis para todos os usuários (filtro userId removido de getDailyRevenues e getAccuracyHistory)
- [x] finRevenueForecasts: dados visíveis para todos os usuários
- [x] forecastSettings: mantido por userId (cada usuário pode ter suas próprias médias)

## Apagar Valores Reais do Calendário (01/04)
- [x] Endpoint backend: deleteRealRevenue (por data específica)
- [x] Endpoint backend: clearMonthRealRevenues (apagar todos os reais de um mês)
- [x] Modal do dia: botão "Apagar" (vermelho) quando já tem valor real lançado
- [x] Botão "Limpar Mês" no cabeçalho do calendário com diálogo de confirmação

## Importação de Vendas via XLS + Vinculação com Estoque (01/04)
- [x] Schema: campo externalCode em products (código PDV externo)
- [x] Schema: tabela sales_imports (cabeçalho da importação: mês, status, totais)
- [x] Schema: tabela sales_import_items (itens da importação: produto, qtd, valor, status de vínculo)
- [x] Schema: tabela sales_import_payments (formas de pagamento da importação)
- [x] Migração: pnpm db:push executada com sucesso
- [x] Backend: script Python parse_sales_xls.py (lê caixa e produtos XLS, 210 produtos, 3200 transações)
- [x] Backend: endpoint REST /api/sales-import/upload (multer + python)
- [x] Backend: endpoints tRPC: create, list, detail, linkItem, confirm, delete, getProductsForLinking
- [x] Backend: funções db.sales-import.ts com fuzzy match e desconto de estoque na confirmação
- [x] Frontend: tela SalesImport com upload drag-and-drop de dois arquivos XLS
- [x] Frontend: revisão de itens com status de vínculo (vinculado/pendente/ignorado)
- [x] Frontend: vinculação manual via select de produto do estoque
- [x] Frontend: resumo de pagamentos por forma (dinheiro, crédito, débito, PIX, iFood...)
- [x] Frontend: botão confirmar importação com desconto automático de estoque
- [x] Frontend: histórico de importações com status (pendente/confirmada/cancelada)
- [x] Rota /sales-import e link no menu Vendas

## Controle de Acesso por Papel - RBAC (01/04)
- [x] Definir matriz de permissões: admin / gerente / funcionário
- [x] Criar hook usePermission com canAccess(path) e hasRole(role)
- [x] Filtrar itens de menu do DashboardLayout por papel do usuário logado
- [x] Proteger rotas no frontend: redirecionar para /unauthorized se sem permissão
- [x] Criar página /unauthorized com mensagem amigável e botões de voltar/dashboard
- [x] Atualizar tela de Usuários: labels corretos (Administrador, Gerente, Funcionário)
- [x] Descrição de permissões exibida abaixo do badge de papel no card do usuário
- [x] TypeScript 0 erros

## Corrigir Parser XLS (01/04)
- [x] Substituir parser Python por SheetJS (Node.js puro) para funcionar em produção
- [x] Remover dependência de /usr/bin/python3.11 no router sales-import.ts
- [x] Corrigir valor do Dinheiro: usar V. Pagamento como fallback quando V. Receber = 0
- [x] Resultado: R$ 115.830,36 total, 3.200 transações, 7 formas de pagamento, 210 produtos

## Bug ReviewStep /sales-import (02/04)
- [x] Corrigir TypeError: Cannot read properties of undefined (reading 'toLocaleString') no ReviewStep
  - Adicionado total_units e total_revenue no retorno do parseProdutosXls
  - Protegidos todos os usos de toLocaleString com fallback ?? 0

## Bug Fuzzy Match Importação de Vendas (02/04)
- [ ] Corrigir algoritmo de fuzzy match: todos os 210 produtos estão sendo vinculados ao mesmo produto do estoque
- [ ] Implementar similaridade de texto real (Levenshtein/token overlap) para matching automático

## Vinculação com IA - Produtos PDV x Estoque (02/04)
- [x] Endpoint backend: suggestLinksWithAI (LLM analisa PDV vs estoque em lote, confiança >= 60% aplicada automaticamente)
- [x] Frontend: botão "Sugerir com IA" (roxo) no cabeçalho da tela de revisão
- [x] Frontend: feedback de progresso "IA analisando..." durante o processamento
- [x] Frontend: toast com resumo de vínculos aplicados pela IA
- [x] Usuário pode corrigir manualmente via select após a sugestão da IA

## Correções Importação de Vendas XLS (02/04)
- [x] Corrigido handleConfirm no ReviewStep: vínculos manuais do linkMap agora são enviados ao backend
- [x] Endpoint suggestLinksWithAI melhorado: processa em lotes de 30, threshold 70%, salva externalCode
- [x] Novo endpoint suggestLinksFromParsed: sugestão de IA antes de salvar no banco (ReviewStep)
- [x] Botão "Sugerir com IA" adicionado no ReviewStep (antes de salvar importação)
- [x] createSalesImport salva externalCode nos produtos vinculados para uso em futuras importações
- [x] Fuzzy match threshold mantido em 0.75 (itens com score baixo ficam como "pending")

## Tela de Mapeamento PDV → Estoque e Relatório de Vendas (02/04)
- [x] Backend: endpoint salesImport.getMappings — listar todos os mapeamentos (externalCode + produto)
- [x] Backend: endpoint salesImport.updateMapping — atualizar/remover mapeamento de um produto
- [x] Backend: endpoint salesImport.bulkSuggestMappings — IA sugere vínculos para produtos sem externalCode
- [x] Backend: endpoint salesImport.getSalesReport — top 10 produtos por mês com comparativo
- [x] Frontend: tela /sales/product-mapping com tabela de mapeamentos, busca, edição inline e botão IA
- [x] Frontend: tela /sales/sales-report com top 10 produtos, gráfico de barras e comparativo mensal
- [x] Integrar relatório ao fluxo pós-confirmação de importação (link direto)
- [x] Registrar rotas no App.tsx e itens no menu lateral

## Exportar/Importar Mapeamento via Excel (02/04)
- [x] Backend: endpoint GET /api/mapping/export — gera XLSX com produtos e colunas editáveis
- [x] Backend: endpoint POST /api/mapping/import — lê XLSX e salva vínculos em lote
- [x] Frontend: botão "Exportar Excel" na tela ProductMapping
- [x] Frontend: botão "Importar Excel" com upload na tela ProductMapping
- [x] Script Python mapping_excel.py para exportar/importar XLSX com formatação profissional

## Correção: Excel sem Python (02/04)
- [x] Instalar exceljs e reescrever exportação/importação em TypeScript puro
- [x] Remover dependência do script mapping_excel.py nos endpoints

## Correção: Importação Excel - Planilha não encontrada (03/04)
- [x] Corrigir importMappingFromBuffer para aceitar qualquer planilha/aba do Excel
- [x] Suportar arquivos .xls (formato antigo) além de .xlsx (usando SheetJS)

## Correção: Mapeamento Manual - Digitar código PDV (03/04)
- [x] Corrigir campo de mapeamento para aceitar código digitado manualmente sem exigir seleção do dropdown

## Correção: Botão Salvar some ao editar mapeamento (03/04)
- [x] Corrigir botão Salvar/Cancelar que desaparece ao editar produto já mapeado

## Correção: Erro 404 nas rotas (03/04)
- [ ] Investigar e corrigir rotas que retornam 404

## Proteção contra NF-e Duplicada (07/04)
- [ ] Analisar schema e código do importador NF-e
- [ ] Verificar notas duplicadas existentes no banco
- [ ] Adicionar constraint unique na chave de acesso (chNFe) na tabela de NF-e
- [ ] Validação no backend: retornar erro descritivo se nota já importada
- [ ] Feedback visual no frontend: exibir aviso/badge "Já importada" antes de confirmar

## Proteção contra NF-e Duplicada (07/04)
- [x] Diagnóstico: 20 duplicatas encontradas no banco (NFs de 05/03 e 12/03 importadas 2x)
- [x] Tabela nfe_imports criada com chave única (chNFe ou nNF+CNPJ) e migrada (pnpm db:push)
- [x] Parser NF-e atualizado para extrair chNFe (chave de acesso de 44 dígitos)
- [x] Endpoint parse: verifica duplicata antes de exibir revisão
- [x] Endpoint confirm: bloqueia reimportação (TRPCError CONFLICT) com opção forceImport=true
- [x] Endpoint confirm: registra NF-e na tabela nfe_imports após importação bem-sucedida
- [x] Frontend: aviso vermelho com data da importação anterior e botão "Importar mesmo assim"
- [x] Botão Confirmar desabilitado quando NF-e é duplicata (requer confirmação explícita)

## Correção Executada: Duplicatas NF-e (07/04)
- [x] Executar script de correção: 293 movimentações duplicadas excluídas, 108 produtos com estoque corrigido
- [x] Backup criado em tabela backup_stock_movements_dupes (293 registros preservados)

## Importação em Lote de NF-es (08/04)
- [ ] Backend: endpoint /api/nfe/batch-import para processar múltiplos XMLs de uma vez
- [ ] Frontend: seleção múltipla de arquivos (até 30) com drag-and-drop
- [ ] Frontend: barra de progresso mostrando arquivo atual / total
- [ ] Frontend: relatório final com sucesso/erro por arquivo

## Importação em Lote de NF-e (08/04)
- [x] Frontend: modo "1 arquivo" (revisão detalhada) e modo "Lote (até 30)" com toggle
- [x] Frontend: drag-and-drop múltiplo de XMLs no modo lote
- [x] Frontend: fila de arquivos com status por arquivo (pendente/processando/sucesso/duplicada/erro)
- [x] Frontend: barra de progresso com percentual durante processamento
- [x] Frontend: relatório final com contadores (sucesso, duplicadas, erros, itens no estoque)
- [x] Frontend: botão "Tentar novamente" para arquivos com erro
- [x] Frontend: processamento sequencial com pausa de 300ms entre arquivos

## Limpeza e Reimportação NF-e com Novos Produtos (08/04)
- [ ] Verificar estado atual: produtos novos cadastrados, mapeamentos existentes, NF-es no banco
- [ ] Executar limpeza das NF-es importadas (movimentações + nfe_imports)
- [ ] Verificar e melhorar vinculação automática NF-e → produtos novos na importação

## Vinculação Automática NF-e → Estoque na Importação (08/04)
- [ ] Limpar NF-es existentes no banco (movimentações + nfe_imports)
- [ ] Backend: ao parsear NF-e, sugerir produto do estoque para cada item (fuzzy match + externalCode)
- [ ] Backend: endpoint nfe.confirmWithLinks que recebe mapa de vínculos confirmados
- [ ] Frontend: tela de revisão de vínculos NF-e → Estoque antes de confirmar importação
- [ ] Frontend: modo lote com vinculação automática (confiança alta) e revisão dos pendentes

## Vinculação Automática NF-e → Estoque (08/04)
- [x] Banco limpo: 317 movimentações e 19 registros de NF-e removidos para reimportação
- [x] Backend: fuzzy match por nome como fallback no endpoint parse da NF-e
- [x] Frontend: tela de revisão com Select para vincular itens "Novo" a produtos já cadastrados
- [x] Frontend: opção "Criar novo produto" no Select de vinculação
- [x] Correção: importMappingFromBuffer aceita qualquer formato sem exigir cabeçalho padrão

## Correção de Custo na Importação NF-e (08/04)
- [x] Backend: ao importar NF-e, atualiza costPrice dos produtos existentes (antes só atualizava currentStock)
- [x] Backend: novo endpoint recalcCosts para recalcular custo de todos os produtos a partir do histórico de movimentações
- [x] Frontend: botão "Recalcular Custos" na tela de importação NF-e para corrigir produtos já importados

## Importação de Planilha de Vendas por Produto (08/04)
- [x] Parser parseProdutosXls corrigido: detecção de colunas "Pr. Venda" e "Pr. Venda Total" do PDV
- [x] Parser: fallback inteligente para encontrar coluna de código PDV (coluna antes da descrição com dados numéricos)
- [x] Parser: limpeza de código PDV float (146.0 → 146)
- [x] Backend: arquivo de caixa agora é opcional no endpoint /api/sales-import/upload
- [x] Frontend: arquivo "Vendas por Caixa" marcado como opcional na tela de importação
- [x] Teste: 210 itens parseados, total R$ 116.148,61, todos com código preenchido

## Correção de Matching por Código PDV (08/04)
- [x] matchProductsToStock: busca código também em sku e supplierCode (antes só em externalCode)
- [x] Resultado: 174/210 produtos vinculados automaticamente (83%) — 156 por SKU, 8 por externalCode, 3 por supplierCode, 7 por fuzzy
- [x] 36 produtos pendentes (não têm código PDV cadastrado no banco)

## Correção: Vínculos Automáticos na Tela de Revisão (08/04)
- [x] Backend: endpoint /upload agora executa matchProductsToStock e retorna productId/linkStatus em cada item
- [x] Frontend: linkMap inicializado com os vínculos automáticos do backend (antes sempre iniciava vazio)
- [x] Resultado: 210/210 produtos da planilha de março vinculados automaticamente (100%)

## Módulo de Relatórios Gerenciais (08/04)
- [x] Backend: endpoint reports.costVsSales — custo x venda por produto com margem
- [x] Backend: endpoint reports.topProducts — ranking de produtos mais vendidos
- [x] Backend: endpoint reports.paymentMethods — formas de pagamento do caixa por mês
- [x] Backend: endpoint reports.dre — DRE integrado (receita de vendas + transações financeiras)
- [x] Frontend: página /gerencial com abas: Custo x Venda, Mais Vendidos, Formas de Pagamento
- [x] Frontend: DRE do Financeiro integrado com dados de vendas PDV (receita + CMV)
- [x] Frontend: filtro por mês de referência
- [x] Menu: item Relatórios Gerenciais no grupo Vendas

## Correção DRE + Relatórios Gerenciais de Estoque (08/04)
- [x] DRE: remover linha CMV (já está incluído nas despesas operacionais)
- [x] DRE: ajustar cálculo de Resultado Líquido sem duplicar CMV
- [x] Backend: relatório de produtos mais comprados (via NF-e / stock_movements entrada)
- [x] Backend: relatório de giro de estoque (qtd vendida / estoque atual)
- [x] Backend: relatório de cobertura de estoque (dias de estoque disponível)
- [x] Backend: relatório compras x vendas por produto (comparativo)
- [x] Frontend: nova aba "Estoque Gerencial" na página /gerencial
- [x] Frontend: gráfico top produtos mais comprados
- [x] Frontend: tabela comparativa compras x vendas com giro e cobertura

## Importação de Vendas por Dia (09/04)
- [x] Schema: campos importMode e saleDate na tabela salesImports + migração executada
- [x] Backend: createSalesImport aceita importMode e saleDate
- [x] Backend: endpoint tRPC create aceita importMode e saleDate
- [x] Frontend: seletor de modo (Por Mês / Por Dia) no UploadStep
- [x] Frontend: campo de data específica quando modo Diário
- [x] Frontend: histórico mostra data específica e badge "Diário" para importações diárias

## Integração de Vendas Importadas no Dashboard e Previsão (09/04)
- [x] Backend: getDashboardMetrics soma salesImports confirmados ao total de vendas do mês/dia
- [x] Backend: getSalesChartData inclui importações diárias e mensais no gráfico de 30 dias
- [x] Backend: confirmSalesImport popula automaticamente fin_daily_revenue para importações diárias
- [x] Frontend: Dashboard KPI "Vendas do Mês" e "Vendas Hoje" incluem dados PDV com indicador
- [x] Frontend: Dashboard gráfico "Últimos 30 dias" inclui dados de importações
- [x] Frontend: Previsão de Faturamento recebe faturamento real automaticamente ao confirmar importação diária

## Parser de Caixa por Dia → Previsão de Faturamento (09/04)
- [x] Backend: adaptar parser de caixa XLSX para agrupar V.RECEBER por DATA TRANSAÇÃO
- [x] Backend: normalização de acentos no parser para detectar "DATA TRANSAÇÃO" corretamente
- [x] Backend: ao confirmar importação com arquivo de caixa, popular fin_daily_revenue por dia
- [x] Backend: salvar formas de pagamento por dia nas movimentações diárias
- [x] Backend: correção de query GROUP BY incompatível com sql_mode=only_full_group_by
- [x] Testes: 6 testes do parser de caixa criados e passando (29/29 total)

## Importação Somente de Caixa (09/04)
- [x] Backend: endpoint /api/sales-import/upload-caixa para processar apenas arquivo de caixa
- [x] Backend: endpoint tRPC salesImport.confirmCaixa para salvar fin_daily_revenue sem criar salesImport
- [x] Frontend: botão "Importar Caixa" na tela de importação (sem precisar do arquivo de produtos)
- [x] Frontend: tela CaixaOnlyStep com upload, processamento e resumo dos dias populados
- [x] Frontend: exibir tabela de dias inseridos/atualizados após confirmar importação de caixa
- [x] 29/29 testes passando

## Importação Diária Express com Baixa Automática de Estoque (09/04)
- [x] Backend: endpoint /api/sales-import/upload-produtos-dia para importar produtos de um dia específico
- [x] Backend: função importDiarioExpress no db.sales-import.ts (matching + baixa + previsão)
- [x] Backend: procedimento tRPC salesImport.importDiario que parseia, vincula automaticamente (por código PDV) e confirma em uma única operação
- [x] Backend: ao confirmar importação diária, baixar estoque automaticamente para produtos já vinculados e retornar lista de não vinculados
- [x] Frontend: componente ImportacaoDiariaStep com seletor de data + upload + drag-and-drop
- [x] Frontend: botão "Importação Diária" na tela principal de importação
- [x] Frontend: exibir resumo de produtos baixados no estoque e produtos sem vínculo após importação
- [x] 29/29 testes passando

## Bug: Quantidade Mínima de Estoque não salva (09/04)
- [x] Corrigido: parseInt(data.minStock) || 5 substituía valores válidos como 1 por 5 (operador || trata 0 como falsy)
- [x] Corrigido: agora usa isNaN() para verificar se o valor é válido antes de usar o fallback

## Bug: Contas a Pagar - Editar data e Novo Lançamento não funcionam (15/04)
- [x] Corrigido: openCreate() agora faz reset() com data padrão (hoje) ao abrir o modal
- [x] Corrigido: onSubmit() com validações explícitas e feedback de erro via toast
- [x] Corrigido: backend usa z.coerce.date() para garantir conversão correta de datas
- [x] 29/29 testes passando

## Bug: Nova despesa criada não aparece na lista de Contas a Pagar (15/04)
- [x] Diagnosticado: handleSubmit bloqueava silenciosamente sem mostrar erro quando campos obrigatórios estavam vazios
- [x] Corrigido: formState.errors agora exibe mensagens de erro em vermelho nos campos
- [x] Corrigido: handleSubmit(onSubmit, onError) agora mostra toast quando há erros de validação
- [x] Corrigido: campo de data já vem preenchido com a data de hoje ao abrir o modal

## Bug: Criação de despesa em Contas a Pagar ainda não funciona (15/04 - segunda investigação)
- [x] Diagnosticado: react-hook-form bloqueava o submit silenciosamente por validação interna
- [x] Corrigido: formulário reescrito com useState simples (sem react-hook-form)
- [x] Corrigido: botão "Criar" chama handleSave() diretamente (type=button, não type=submit)
- [x] Corrigido: filtro de mês inicializado corretamente com mês atual ao carregar a página

## Bug: Lançamento criado não aparece na lista de Contas a Pagar (15/04 - terceira investigação)
- [x] Diagnosticado: new Date("2026-04-30") = 2026-04-30T00:00:00Z, mas lançamentos salvos com hora 19:00 UTC ficavam fora do filtro (19:00 > 00:00 = fora do range)
- [x] Corrigido FinPayables: dateFrom usa T00:00:00, dateTo usa T23:59:59 (cobre todo o dia)
- [x] Corrigido FinReceivables: mesmo bug corrigido + formulário reescrito sem react-hook-form
- [x] Corrigido FinBankStatements: mesmo bug corrigido + formulário reescrito sem react-hook-form
- [x] 0 erros TypeScript após todas as correções

## Relatório Contas a Pagar por Dia da Semana (16/04)
- [x] Backend: função getPayablesByWeekday no db.fin.ts (agrupa por DAYOFWEEK MySQL, segunda a sexta)
- [x] Backend: procedimento tRPC fin.weekdayReport.payablesByWeekday com filtro de mês/ano
- [x] Backend: retorna pendente, pago, vencido, total e lista de lançamentos por dia
- [x] Frontend: página FinWeekdayReport (/fin/weekday-report) com navegação de mês
- [x] Frontend: 4 KPI cards (Pendente, Pago, Vencido, Total Geral)
- [x] Frontend: gráfico de barras por dia da semana (Recharts)
- [x] Frontend: tabela expandida com lista de lançamentos ao clicar em cada dia
- [x] Frontend: rota /fin/weekday-report registrada no App.tsx
- [x] Frontend: item "Relatório Semanal (Pagar)" adicionado no menu lateral (grupo Financeiro)
- [x] 29/29 testes passando

## Relatório Semanal: Separar por Semana do Mês (16/04)
- [x] Backend: função getPayablesByWeek no db.fin.ts — agrupa por semana do mês (1ª a 4ª), dias Seg-Sex, com dateLabel por dia
- [x] Backend: procedimento tRPC fin.weekdayReport.payablesByWeek com filtro de mês/ano
- [x] Frontend: FinWeekdayReport atualizado com duas abas: "Por Semana do Mês" e "Visão Geral (Seg–Sex)"
- [x] Frontend: seletor de semana (1ª, 2ª, 3ª, 4ª Semana) com intervalo de datas
- [x] Frontend: gráfico de barras por dia da semana selecionada
- [x] Frontend: tabela expandida com lista de lançamentos por dia da semana selecionada
- [x] Frontend: totais por semana (pendente, pago, vencido, total)
- [x] 29/29 testes passando

## Reimportação Inteligente de Vendas por Delta (18/04)
- [x] Backend: ao confirmar nova importação do mesmo mês, buscar última importação confirmada do mesmo referenceMonth
- [x] Backend: calcular delta por produto (nova qtd - qtd anterior) e aplicar apenas a diferença no estoque
- [x] Backend: se delta > 0 (vendeu mais) → descontar; se delta < 0 (vendeu menos) → devolver ao estoque
- [x] Backend: registrar movimentação de estoque com tipo "adjustment" e motivo de reimportação
- [x] Backend: produtos removidos da nova importação têm estoque devolvido automaticamente
- [x] Frontend: aviso visual (banner âmbar) ao abrir importação pendente do mesmo mês já confirmado
- [x] Frontend: endpoint tRPC checkReimport para verificar se há importação anterior confirmada
- [x] 29/29 testes passando

## Arquivar Importação Anterior após Reimportação (18/04)
- [x] Schema: campo archived (boolean, default false) + archivedAt na tabela salesImports
- [x] Backend: função archiveSalesImport e endpoint tRPC salesImport.archive
- [x] Backend: getSalesImports filtra arquivadas por padrão (showArchived=false)
- [x] Backend: parâmetro showArchived para listar todas incluindo arquivadas
- [x] Frontend: após confirmar reimportação, toast com botão "Arquivar importação anterior"
- [x] Frontend: botão "Arquivar" no cabeçalho do detalhe de importações confirmadas
- [x] Frontend: toggle "Mostrar arquivadas" na lista de importações
- [x] Frontend: badge visual "Arquivada" nas importações arquivadas
- [x] 29/29 testes passando

## Bug Fix: Invalid Date nas Importações Diárias (18/04)
- [x] Corrigir exibição de data nas importações diárias na lista (saleDate pode ser Date object ou string do banco)

## Relatório de Média de Vendas por Produto (18/04)
- [x] Backend: função getSalesAverageByProduct — média mensal de quantidade vendida por produto nos últimos N meses
- [x] Backend: procedimento tRPC salesImport.salesAverage com parâmetro months (3, 6, 12)
- [x] Frontend: página SalesAverage.tsx com tabela de produtos, média mensal, mês a mês e sugestão de estoque mínimo
- [x] Frontend: link no menu Vendas → "Média de Vendas" (/sales/average)
- [x] Frontend: filtro de período (últimos 3, 6, 12 meses)
- [x] Frontend: coluna "Estoque Atual" vs "Média Mensal" com indicador visual (verde/âmbar/vermelho)
- [x] Frontend: gráfico de barras Top 15 mais vendidos
- [x] Frontend: cards resumo (total, crítico, baixo, sem cadastro)
- [x] Frontend: sugestão de estoque mínimo = média × 1,2
- [x] 29/29 testes passando

## Aplicar Estoque Mínimo Sugerido em Lote (18/04)
- [x] Backend: endpoint tRPC products.applyMinStockBulk — atualiza minStock de até 500 produtos em lote
- [x] Frontend: botão verde "Aplicar sugestões (N)" no cabeçalho da página SalesAverage
- [x] Frontend: modal de confirmação com tabela de preview (produto, média, novo mínimo)
- [x] Frontend: feedback de sucesso via toast com contagem de produtos atualizados
- [x] 29/29 testes passando

## Bug Fix: KPI "Vendas do Mês" exibindo valor incorreto (18/04)
- [x] Investigado: importação arquivada (ID 2, R$22.781,94) estava sendo somada ao KPI
- [x] Corrigido: filtro do KPI agora exclui importações com archived=true

## Widget Estoque Baixo: Ordenar por Mais Vendidos (18/04)
- [x] Backend: getLowStockProducts atualizado com LEFT JOIN em salesImportItems (6 meses), ordenado por SUM(quantity) DESC
- [x] Frontend: widget Estoque Baixo no Dashboard mostra os produtos mais vendidos com estoque baixo primeiro
- [x] 29/29 testes passando

## Bug Fix: Data incorreta nas importações diárias (20/04)
- [x] Corrigido: data exibida com 1 dia a menos por causa do fuso horário UTC-3 — agora usa split de string YYYY-MM-DD sem converter para Date object

## Bug Fix: Gráfico "Vendas — Últimos 30 dias" incorreto (20/04)
- [x] Corrigido: importações mensais arquivadas (archived=true) estavam sendo somadas no gráfico
- [x] Corrigido: importações mensais agora são distribuídas igualmente pelos dias do mês (sem pico artificial)
- [x] Datas do eixo X já usavam string YYYY-MM-DD corretamente — sem bug de fuso horário

## Bug Fix: Datas no Relatório Semanal Financeiro (20/04)
- [x] Verificado: getPayablesByWeek usa timestamp (não date), sem problema de fuso horário
- [x] 29/29 testes passando

## Fase de Consolidação (20/04)

### Bug Fuzzy Match NF-e
- [ ] Corrigir algoritmo de similaridade de texto para vincular produtos da NF-e ao estoque (Levenshtein/token overlap)
- [ ] Testar com NF-e real para garantir que cada produto vincula ao produto correto

### Registro de Compra no Card do Cliente
- [x] Criar tabela customer_purchases no schema (customerId, amount, paymentMethod, pointsEarned, notes, userId, createdAt)
- [x] Backend: endpoint customers.registerPurchase — registra compra, calcula pontos pela regra ativa e cria pointsTransaction
- [x] Frontend: botão "Registrar Compra" no card do cliente com modal (valor + forma de pagamento)
- [x] Frontend: ao salvar, atualizar pontos do cliente em tempo real

### Histórico de Compras e Ticket Médio
- [x] Backend: endpoint customers.purchaseHistory — retorna últimas N compras do cliente
- [x] Backend: endpoint customers.purchaseStatsFromTable — retorna visitCount, totalSpent, avgPurchase, lastVisitDate
- [x] Frontend: seção "Histórico de Compras" no card expansível (data, valor, pontos, forma de pagamento)
- [x] Frontend: KPIs de Visitas, Ticket Médio e Total Gasto no card do cliente
- [x] Frontend: data da última visita exibida no card expansível
- [ ] Bug fix: data de aniversário exibida com 1 dia a menos (fuso horário)

### Exportação Excel
- [x] Exportar relatório de Média de Vendas por Produto para Excel (.xlsx) — SalesAverage.tsx
- [x] Exportar aba Ranking Completo (GerencialReports) para Excel
- [x] Exportar aba Custo x Venda (GerencialReports) para Excel
- [x] Exportar aba Formas de Pagamento (GerencialReports) para Excel
- [x] Exportar Contas a Pagar (FinPayables) para Excel
- [x] Exportar Contas a Receber (FinReceivables) para Excel
- [ ] Exportar relatório de Contas a Pagar (semanal por semana do mês) para Excel
- [ ] Exportar lista de Estoque Baixo para Excel
