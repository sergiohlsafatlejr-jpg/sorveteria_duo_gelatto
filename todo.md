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
