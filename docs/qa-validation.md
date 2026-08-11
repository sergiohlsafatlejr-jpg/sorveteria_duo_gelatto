# Validação visual — módulo de compras

## Dashboard mensal — desktop

Validação realizada em 10/08/2026 no caminho `/purchases/dashboard`, viewport 1440 × 900, após definir `isAnimationActive={false}` no gráfico diário.

- As dez barras diárias de julho de 2026 estão visíveis dentro da área do gráfico.
- A cor das barras é roxa (`#6d4ce8`), consistente com o destaque visual do módulo.
- O eixo vertical exibe valores monetários em português, de `R$ 0` até `R$ 4 mil`.
- O eixo horizontal exibe as datas `02/07`, `08/07`, `09/07`, `15/07`, `16/07`, `22/07`, `23/07`, `27/07`, `29/07` e `30/07`.
- A maior barra aparece em `02/07`, próxima de `R$ 4 mil`, coerente com os dados consolidados do período.
- Não foram observados cortes, sobreposições ou texto ilegível no gráfico.

## Demais páginas — desktop

Também foram capturadas e inspecionadas as páginas `/purchases/invoices`, `/purchases/items`, `/purchases` e `/stock/boxes`. As tabelas, filtros, cartões e paginação ficaram legíveis em 1440 × 900. A tela por item exibiu 147 registros da Sorvefort paginados em seis páginas, e a tela de caixas de 10 L exibiu o histórico de julho sem alterar o saldo atual do PDV INOVE.

## Validação móvel

As páginas principais foram capturadas em 390 × 844. O dashboard reorganizou indicadores, gráfico, concentração, recorrência e categorias em uma única coluna; as barras e os rótulos permaneceram legíveis. O histórico de notas e a lista por item mantiveram filtros acessíveis, tabelas com rolagem horizontal e paginação visível. A tela de Caixas de 10 L foi verificada também em captura apenas do viewport, sem redução da página completa, confirmando que cabeçalho, botões, indicadores e filtros usam tamanho de texto legível e duas colunas apenas quando há espaço.

| Página | Resultado móvel |
|---|---|
| `/purchases/dashboard` | Indicadores empilhados, gráfico visível e cartões sem sobreposição |
| `/purchases/invoices` | Upload, filtros e histórico acessíveis; tabela usa rolagem horizontal |
| `/purchases/items` | Filtros, quatro indicadores e paginação dos 147 itens acessíveis |
| `/stock/boxes` | Cabeçalho, ações e indicadores legíveis; a aparência comprimida da miniatura integral não se reproduziu no viewport real |

## Painel de Compras — resumo mensal por item

Validação realizada em 10/08/2026 no caminho `/purchases`, usando os dados reais importados de julho de 2026. A visualização em 1440 × 1000 exibiu o filtro **Mês de referência**, os indicadores mensais e quatro grupos de itens recolhidos por padrão, evitando uma página excessivamente longa.

| Indicador de julho de 2026 | Resultado exibido |
|---|---:|
| Quantidade total comprada | 349 unidades |
| Produtos distintos | 108 |
| Notas fiscais consideradas | 13 |
| Subtotal das linhas das notas | R$ 19.322,44 |

| Categoria | Quantidade | Produtos | Notas | Valor |
|---|---:|---:|---:|---:|
| Guloseimas | 203 | 44 | 5 | R$ 2.732,72 |
| Caldas | 59 | 35 | 5 | R$ 5.504,90 |
| Utensílios/Descartáveis | 3 | 2 | 2 | R$ 149,70 |
| Insumos | 84 | 30 | 13 | R$ 10.935,12 |

Ao abrir uma categoria, a tabela detalha **produto, quantidade, unidade, preço médio, valor total e notas de origem**, incluindo número da nota, data, fornecedor e quantidade proveniente de cada documento. O INOVE não aparece como fornecedor; permanece tratado exclusivamente como sistema de PDV/estoque.

Na validação móvel em 390 × 844, as seis abas foram reorganizadas em duas colunas, os quatro indicadores ficaram em uma grade 2 × 2, o seletor de mês permaneceu acessível e os grupos de categoria não apresentaram cortes ou sobreposição. O detalhamento usa rolagem horizontal quando aberto, preservando a legibilidade das colunas.

Foram executados **70 testes automatizados**, além de **2 testes de integração real com banco**, todos aprovados. A checagem TypeScript (`tsc --noEmit`) terminou sem erros.

## Correção — dados no Almoxarifado e Consumo Interno

Após o relato de ausência de dados, foi confirmado que as notas estavam armazenadas, porém a área operacional consultava somente saldos físicos já confirmados. A visualização foi corrigida para combinar as compras extraídas com o cadastro físico, sem transformar compras históricas em estoque atual.

| Tela validada | Resultado de julho de 2026 |
|---|---:|
| Resumo — produtos de consumo interno | 92 |
| Resumo — unidades de consumo interno | 298 |
| Resumo — valor de consumo interno | R$ 10.101,03 |
| Almoxarifado — catálogo visível | 92 produtos com quantidade, valor, preço médio e notas |
| Consumo Interno — produtos encontrados | 92 |
| Consumo Interno — unidades compradas | 298 |
| Consumo Interno — saldos positivos para baixa | 0, aguardando conferência física |

As caixas de **10 L** foram excluídas dessa visão operacional e continuam no controle específico de estoque. Os cartões sem saldo mostram **“Aguardando conferência”** e oferecem acesso às notas, evitando apresentar quantidade histórica como saldo disponível. As três telas foram verificadas em 1440 × 1200 e as telas de Almoxarifado/Consumo Interno também foram verificadas em 390 × 844.

Após a correção, foram executados **73 testes automatizados** e **2 testes de integração real com banco**, todos aprovados. A checagem TypeScript (`tsc --noEmit`) terminou sem erros.
