# Diagnóstico das Metas de Produtos — setembro de 2026

O botão **Copiar mês anterior** calculava o período anterior por meio de um objeto `Date` à meia-noite. A conversão para o fuso de São Paulo recuava a data para o último dia de julho; assim, ao copiar setembro, o sistema procurava julho em vez de agosto. O cálculo passou a ser feito diretamente sobre a chave `AAAA-MM`, sem conversão de fuso.

As três metas ativas de agosto foram copiadas para setembro, preservando integralmente os produtos selecionados. Uma segunda execução foi validada e ignorou as três metas já existentes, sem criar duplicidades.

A lista do formulário utilizava somente produtos com vendas no mês selecionado. Como setembro ainda não tinha venda de todos os sabores, **Açaí com Banana 1,5L** e **Açaí com Leitinho 1,5L** não apareciam. O formulário passou a consultar os **311 produtos ativos** do catálogo INOVE e combinar esse catálogo com as vendas do mês apenas para exibir quantidade e faturamento.

| Validação | Resultado |
|---|---|
| Metas copiadas de agosto para setembro | 3 |
| Segunda cópia | 0 novas e 3 ignoradas |
| Açaí com Banana 1,5L no catálogo | Sim — produto INOVE 91 |
| Açaí com Leitinho 1,5L no catálogo | Sim — produto INOVE 92 |
| Catálogo completo | 311 produtos ativos |
| Validação móvel | 390 × 844 px, sem overflow horizontal |
| Medição DOM do diálogo | `clientWidth = 372`, `scrollWidth = 372`, overflow horizontal falso |

Foram adicionados testes de regressão para o cálculo do mês anterior, preservação da seleção, prevenção de nomes duplicados e manutenção de produtos ativos mesmo sem vendas no mês.
