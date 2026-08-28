# Diagnóstico da atualização do Dashboard

**Data:** 28 de agosto de 2026

O Dashboard principal mostrava faturamento e metas zerados porque os endpoints consultavam diretamente o SQL Server INOVE. Quando a conexão da loja era encerrada com `socket hang up`, o backend devolvia `null` ou listas vazias, mesmo havendo dados sincronizados no banco local.

O Dashboard passou a usar primeiro as tabelas persistidas `fin_daily_revenue` e `inove_sales_cache`. Com o INOVE indisponível, os endpoints foram validados em **367 ms** e retornaram faturamento mensal de **R$ 116.656,23**, **2.903 transações** e ticket médio de **R$ 40,18**, em vez de zero.

O cache mensal de produtos existente contém somente os dez produtos mais vendidos da última sincronização bem-sucedida. Por isso, as metas de produtos exibem uma indicação de **lista parcial sincronizada** até que o INOVE volte a responder. A rotina diária foi atualizada para gravar todos os produtos nas próximas sincronizações, sem perder compatibilidade com o cache antigo.

O cache disponível foi atualizado pela última vez em 27 de agosto de 2026 e cobre o faturamento diário de 1º a 26 de agosto. Tentativas manuais de atualização em 28 de agosto falharam porque a conexão do INOVE continuava sendo encerrada pela rede da loja.
