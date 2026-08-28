# Diagnóstico da atualização do Dashboard

**Data:** 28 de agosto de 2026

O Dashboard principal mostrava faturamento e metas zerados porque os endpoints consultavam diretamente o SQL Server INOVE. Quando a conexão da loja era encerrada com `socket hang up`, o backend devolvia `null` ou listas vazias, mesmo havendo dados sincronizados no banco local.

O Dashboard passou a tentar os dados atuais do INOVE e, em caso de indisponibilidade, usar as tabelas persistidas `fin_daily_revenue` e `inove_sales_cache`. Com o INOVE indisponível, os endpoints foram validados em **367 ms** e retornaram faturamento mensal de **R$ 116.656,23**, **2.903 transações** e ticket médio de **R$ 40,18**, em vez de zero.

As metas de produtos estavam incorretas porque o Dashboard calculava o realizado a partir de um cache antigo com somente os dez produtos mais vendidos. A auditoria direta de agosto de 2026 encontrou **144 produtos vendidos** e confirmou os seguintes realizados para os itens selecionados: **Picolé: 4.677 unidades e R$ 21.125,37**, **Potes Sorvetes: 368 unidades e R$ 9.592,90** e **Açaí Potes: 146 unidades e R$ 6.779,40**.

O cálculo foi centralizado no backend e agora faz correspondência exata por identificador ou nome normalizado de cada produto marcado. O Dashboard e a tela de Metas consultam o INOVE a cada **60 segundos enquanto estão abertos**. Cada tela mostra a origem e a data e hora da atualização. Uma consulta ao vivo também renova o cache completo no MySQL; se a rede da loja cair, o sistema usa a última sincronização válida sem zerar os indicadores.
