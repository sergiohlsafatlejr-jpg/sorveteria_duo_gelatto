# Pré-validação visual — NF-eJHN08-2026.pdf

## Resumo estrutural

O arquivo `NF-eJHN08-2026.pdf` contém **20 páginas** e, pela inspeção visual inicial, não é uma única nota: ele reúne **múltiplas DANFEs** do mesmo emitente, o que pode quebrar um importador que espere exatamente **1 NF-e por PDF**.

## Emitente e destinatário observados

- **Emitente:** DUO GELATTO SORVETES LTDA
- **Destinatário:** JHN COMERCIO DE ALIMENTOS LTDA
- **Natureza da operação:** VENDA
- **Período observado nas primeiras páginas:** agosto/2026

## DANFEs identificadas na amostragem inicial

| Página(s) | NF-e | Data | Valor total observado | Observações |
|---|---|---|---:|---|
| 1 | 000.013.465 | 03/08/2026 | R$ 450,84 | Página única; 5 itens visíveis |
| 2-3 | 000.013.512 | 06/08/2026 | R$ 6.240,03 | DANFE com continuação em 2 páginas; grande volume de itens |
| 4 | 000.013.551 | 10/08/2026 | R$ 1.262,70 | Página única |
| 5 | 000.013.602 | 13/08/2026 | R$ 8.999,25 | DANFE com continuação em 2 páginas, pelo indicador 1/2 |

## Itens/produtos observados

Os itens visíveis incluem uma mistura de categorias, como:

- caixas de **10 litros**,
- potes e sorvetes de **1L / 1,5L / 5L**,
- packs,
- picolés,
- produtos de açaí.

## Hipótese operacional para a falha

O comportamento mais provável é que o fluxo atual da página `/purchases/invoices` esteja assumindo um documento simples, enquanto este arquivo funciona como um **lote mensal de DANFEs**, com notas independentes e algumas delas distribuídas em mais de uma página.

## Próximo passo técnico

Auditar o importador para responder a três perguntas:

1. se o upload aceita PDF grande e multipágina;
2. se o parser consegue separar uma DANFE da outra dentro do mesmo arquivo;
3. se a confirmação final grava uma nota por chave/NF-e, impedindo duplicidades.

## Pré-validação completa sem gravação

O PDF completo foi enviado ao extrator atual apenas para pré-validação, **sem inserir notas no MySQL**. O processamento terminou em aproximadamente **153 segundos** e retornou 16 documentos, 362 linhas e R$ 39.598,33.

Uma segunda conferência independente por OCR local revelou três leituras críticas que precisam ser corrigidas antes da importação:

| Página | Documento real | Natureza real | Leitura atual incorreta |
|---:|---|---|---|
| 9 | NF-e 000.013.684 | **DEVOLUÇÃO** | Lida como venda 000.013.688 |
| 13 | NF-e 000.013.693 | **TROCA** | Lida como uma segunda NF-e 000.013.692 |
| 19 | NF-e 000.013.829 | **VENDA** | Lida como 000.013.821 |

Portanto, o lote contém **14 notas de compra elegíveis** e dois documentos que não devem gerar entrada normal de estoque: uma devolução e uma troca. O parser deve extrair e validar a natureza da operação, validar a chave de acesso e impedir a confirmação automática de documentos que não sejam venda.

A NF-e 000.013.744 também exige revisão: o total extraído foi R$ 3.037,65, enquanto a soma das linhas reconhecidas ficou em R$ 2.968,25, diferença de R$ 69,40. Essa nota deve permanecer em **Revisar** até a linha ausente ser conferida.

## Resultado final após a correção

O limite técnico do modelo é de 50 MB por PDF. Como o arquivo possui 63.784.218 bytes, o importador passou a dividi-lo automaticamente em quatro blocos de seis páginas, com uma página de sobreposição. A sobreposição preserva notas que ocupam duas páginas; a fusão final usa a chave de acesso para remover repetições.

Após a nova extração, a NF-e 000.013.744 foi reconciliada em R$ 3.037,65 e 27 linhas. O lote foi gravado no MySQL para revisão, **sem confirmar entradas no estoque**.

| Resultado gravado | Quantidade | Valor das notas |
|---|---:|---:|
| Vendas | 14 documentos / 360 linhas | R$ 39.428,15 |
| Devolução | 1 documento / 1 linha | R$ 53,48 |
| Troca | 1 documento / 1 linha | R$ 116,70 |
| Total documental | 16 documentos / 362 linhas | R$ 39.598,33 |

Das 14 vendas, 13 ficaram com status **Extraída**. A NF-e 000.013.648 ficou em **Revisar** porque a leitura da chave de acesso não passou no dígito verificador. A devolução 000.013.684 e a troca 000.013.693 também ficaram em **Revisar** e são bloqueadas definitivamente na confirmação de estoque.

Uma segunda tentativa de enviar o mesmo arquivo retornou HTTP 409, comprovando que o hash do documento impede importação duplicada.

A página `/purchases/invoices` foi validada autenticadamente em 390 × 844 px. As 16 novas notas aparecem no histórico, a tela não possui overflow horizontal (`scrollWidth = 390`) e o lote totaliza 20 registros junto às quatro notas anteriores. Os testes do extrator, divisão em lotes, confirmação e indicadores somaram 20 casos aprovados; a checagem TypeScript e o build de produção também foram concluídos.
