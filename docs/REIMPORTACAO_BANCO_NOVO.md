# Plano de reimportação do banco novo

**Autor:** Manus AI  
**Projeto:** Sistema de Gestão Sorveteria Duo Gelatto  
**Data:** 27 de agosto de 2026

O banco foi recriado a partir do schema atual do sistema, sem inserir informações fictícias. O usuário administrador foi restabelecido e o conector INOVE foi ativado e testado com sucesso. A sincronização automática recuperou os dados que continuam disponíveis no SQL Server da loja.

| Dados recuperados automaticamente | Volume validado |
| --- | ---: |
| Tabelas do sistema | 60 |
| Produtos do INOVE | 311 |
| Produtos com saldo diferente de zero | 257 |
| Movimentações iniciais de estoque | 257 |
| Cadastros de caixas 10L | 59 |
| Vendas individuais recentes | 4 |
| Faturamento diário | 57 dias, de 01/07/2026 a 26/08/2026 |
| Total do faturamento sincronizado | R$ 220.797,34 |
| Cache de vendas por produto | 3 meses |

## Ordem segura de reconfiguração e reimportação

| Ordem | Módulo | Procedimento | Origem dos dados |
| ---: | --- | --- | --- |
| 1 | Acesso e permissões | Confirmar o administrador e recriar outros usuários somente quando necessário. | Contas reais dos usuários |
| 2 | INOVE | Manter o conector ativo e validar produtos, saldos, vendas e faturamento antes de importar arquivos externos. | SQL Server INOVE |
| 3 | Estoque de caixas 10L | Informar a contagem física atual de cada caixa. O INOVE fornece nomes e custos, mas não controla o saldo físico dessas caixas. | Contagem física da loja |
| 4 | Forecast | Recriar a meta mensal e os parâmetros de previsão. O faturamento real de 01/07/2026 a 26/08/2026 já está persistido. | Parâmetros gerenciais e INOVE |
| 5 | Notas de compras | Reimportar os PDFs/XMLs disponíveis, conferindo fornecedor, número da nota e valor para evitar duplicidade. | Arquivos fiscais reais |
| 6 | Rede | Reimportar os arquivos Excel da adquirente em ordem cronológica e executar novamente a conciliação. | Arquivos Rede reais |
| 7 | Metas de produtos | Selecionar novamente os produtos do INOVE e informar as metas do mês atual. | Definições gerenciais |
| 8 | Almoxarifado e compras | Recriar somente itens físicos existentes, fornecedores, saldos e pedidos ainda abertos. | Contagem física e documentos reais |
| 9 | Financeiro | Recriar contas, despesas, recebíveis e saldos usando extratos e documentos de origem. | Extratos e documentos reais |
| 10 | Comunicações | Reconfigurar WhatsApp, notificações e campanhas apenas após validar clientes e permissões. | Credenciais e bases reais |

## Regras de segurança

Cada arquivo deve ser importado uma única vez e conferido antes de avançar para o próximo período. Não devem ser criados clientes, vendas, notas, avaliações ou testemunhos fictícios. Antes de importar notas ou arquivos da Rede em lote, deve-se validar um arquivo real e confirmar que o registro persiste após atualizar a página.

Os dados antigos que não existem no INOVE só podem ser recompostos pelos arquivos originais mantidos pela empresa. A sincronização automática continuará atualizando as vendas recentes a cada cinco minutos, o faturamento às 08:00 e 20:00 e o cache de vendas diariamente, desde que o conector permaneça ativo.
