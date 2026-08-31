# Auditoria dos pagamentos de agosto de 2026

**Fonte primária:** arquivo `fechanebti082026.xlsx`, relatório **Movimentação Recebimento(s)** do INOVE, emitido em 31/08/2026 e referente ao período de 01/08/2026 a 30/08/2026 23:59:59.

| Forma de pagamento | Total correto | Vendas únicas |
|---|---:|---:|
| C. Crédito | R$ 48.745,89 | 1.169 |
| C. Débito | R$ 46.411,27 | 1.260 |
| Pix | R$ 33.198,69 | 758 |
| Dinheiro | R$ 11.478,40 | 325 |
| Cortesia | R$ 1.924,68 | 54 |
| Convênio | R$ 796,94 | 62 |
| **Total recebido** | **R$ 142.555,87** | — |

O Relatório de Vendas mostrava **R$ 15.727,66** em Dinheiro porque somava `PAGAMENTOS_VENDAS.PAG_VALOR`, que representa o valor entregue pelo cliente. O INOVE registra o troco em `PAG_DEVOLUCAO`. Em agosto, o valor bruto recebido em espécie foi R$ 15.727,66 e o troco foi R$ 4.249,26; portanto, o valor líquido correto é **R$ 11.478,40**.

Exemplos confirmados no SQL Server: a venda 116578 registrou R$ 30,00 recebidos e R$ 2,49 devolvidos, resultando em R$ 27,51; a venda 116588 registrou R$ 10,00 e R$ 4,00 de troco, resultando em R$ 6,00; a venda 116595 registrou R$ 100,00 e R$ 58,97 de troco, resultando em R$ 41,03. Esses valores coincidem com a planilha oficial.

O total bruto das vendas finalizadas no mesmo intervalo foi R$ 142.985,61. A diferença de R$ 429,74 para os recebimentos corresponde aos descontos registrados em `VENDAS.VEN_DESCONTO`. Assim, o fechamento de pagamentos deve usar os recebimentos líquidos; o faturamento bruto e os descontos devem permanecer identificados separadamente.
