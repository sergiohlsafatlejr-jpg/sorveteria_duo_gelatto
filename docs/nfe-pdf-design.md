# Módulo de notas fiscais em PDF

## Objetivo

O módulo amplia a importação atual de NF-e em XML sem substituí-la. PDFs enviados por usuários autenticados ficam armazenados no S3; o banco guarda somente metadados, resultados estruturados e vínculos com os módulos já existentes. Um único PDF pode conter uma ou várias notas, sempre registradas separadamente.

## Vocabulário do domínio

**Duo Gelatto Sorvetes Ltda** e **Duo Gelatto Indústria de Sorvetes Ltda** são fornecedoras das caixas de 10 L identificadas nas notas de julho de 2026. **INOVE** é exclusivamente o sistema de PDV/estoque usado pela loja; portanto, não entra em rankings, filtros ou cadastros de fornecedores.

| Conceito | Representação |
|---|---|
| Fornecedor | Cadastro reutilizado de `operational_suppliers`, vinculado por CNPJ ou nome normalizado |
| Documento PDF | Arquivo único no S3, identificado por `documentHash` |
| Nota fiscal | Uma linha em `purchase_invoices`; `documentIndex` mantém a ordem dentro do PDF |
| Item da nota | Uma linha em `purchase_invoice_items`, sempre vinculada à nota correta |
| Categoria | Taxonomia gerencial gravada em cada item: limpeza, guloseimas, caldas, descartáveis, embalagens, manutenção, insumos ou outros |
| Produto operacional | Vínculo opcional por `operationalItemId` |
| Caixa de 10 L | Vínculo opcional por `boxStockId` |
| Sistema INOVE | Fonte externa de vendas e saldo de estoque, relacionada ao catálogo por `inoveProductId` |

## Fonte de verdade

A tabela `purchase_invoices` representa cada nota extraída de PDF e registra arquivo, hash, posição no documento, fornecedor, status de processamento, modelo de IA, confiança, divergências e datas de revisão/confirmação. A tabela `purchase_invoice_items` representa cada linha, com quantidade, unidade, preço, total, categoria gerencial e vínculos opcionais com item operacional ou caixa de 10 L.

A importação XML permanece nas tabelas e rotas anteriores. Os dois fluxos coexistem e compartilham os módulos de compras e estoque somente após confirmação explícita.

## Estados

| Status | Significado |
|---|---|
| `pending` | PDF armazenado e aguardando processamento |
| `processing` | Extração por IA em andamento |
| `extracted` | Estrutura válida e conciliação aprovada |
| `review_required` | Dados extraídos, mas existem campos ou totais que exigem conferência |
| `confirmed` | Usuário revisou e confirmou a nota; os vínculos de estoque foram criados |
| `error` | Falha técnica, documento incompatível ou nota removida do último reprocessamento |

## Fluxo operacional

1. O usuário envia um PDF de até 15 MB. O servidor valida extensão, MIME, assinatura `%PDF` e hash para evitar duplicidade.
2. O arquivo é gravado no S3 e a primeira nota é criada como `pending`.
3. O servidor obtém uma URL temporária e solicita extração multimodal com JSON Schema estrito.
4. A IA separa todas as NF-e do PDF; o sistema cria um registro por nota e mantém os itens associados ao documento correto.
5. Regras determinísticas validam campos obrigatórios, `quantidade × preço unitário`, soma dos itens e total da nota.
6. Cada nota fica `extracted` quando passa nas verificações ou `review_required` quando há divergência.
7. O usuário revisa cabeçalho e categorias antes de confirmar.
8. Somente a confirmação gera entrada em Compras Internas ou Caixas de 10 L; reprocessamento e edição são bloqueados depois disso.

## Regras gerenciais

A visão de Compras Internas preserva as categorias existentes. Para o resumo, `limpeza` aparece como **Material de limpeza**, `guloseimas` como **Guloseimas** e as demais categorias aparecem agrupadas como **Outros itens**.

Compras da Sorvefort são identificadas por nome normalizado contendo `SORVEFORT`. A tela mostra as linhas de produto e permite filtro por período, produto e categoria, nunca apenas o total da nota.

Itens cuja descrição indica 10 L são ligados a `box_stock`. A confirmação de uma nota nova cria a entrada correspondente e impede duplicidade por transação. O histórico de preço, quantidade e frequência é calculado a partir de itens confirmados e ligados a caixas.

O validador rejeita `INOVE` no campo fornecedor. Se a IA interpretar uma marca do sistema como emitente, a nota recebe status `review_required` para correção humana.

## Carga histórica de julho de 2026

A carga inicial usa somente itens de 10 L com quantidade, preço unitário e total legíveis na base validada. Foram registrados **8 documentos fiscais**, **27 linhas de produto**, **51 unidades** e **R$ 9.221,41** em compras históricas da Duo Gelatto.

Como são compras anteriores ao saldo operacional atual, elas alimentam o catálogo e a análise histórica, mas não geram movimentos retroativos nem aumentam o saldo atual sincronizado pelo INOVE. Cada linha mantém a referência ao PDF original e uma marca de importação histórica parcial.

## Modelo de IA e controle de custo

O processamento padrão usa `gemini-3-flash-preview`, adequado a PDFs multimodais e saída estruturada. O sistema registra modelo, tokens e duração. Documentos que falharem nas verificações ficam disponíveis para revisão e reprocessamento; não há reprocessamento premium automático sem ação do usuário.

Na referência de preços consultada para o modelo em agosto de 2026, o `gemini-3-flash-preview` custa **US$ 0,50 por 1 milhão de tokens de entrada** e **US$ 3,00 por 1 milhão de tokens de saída**. O custo técnico estimado de uma execução é calculado por `(tokens de entrada × 0,50 / 1.000.000) + (tokens de saída × 3,00 / 1.000.000)`. Os preços podem mudar e a cobrança exibida pela plataforma é a fonte de verdade; por isso, o banco conserva a quantidade real de tokens de cada processamento, em vez de fixar um valor monetário na nota.

## Limitações e controles

| Limitação | Controle adotado |
|---|---|
| Digitalização desfocada, cortada ou com texto muito pequeno | Nota fica em `review_required`; o usuário pode corrigir ou reprocessar |
| Descontos, frete, impostos ou arredondamentos fora das linhas de produto | Tolerância determinística de conciliação e apresentação explícita das divergências |
| Um PDF com várias notas | Separação por `documentHash` e `documentIndex`, preservando o vínculo com o arquivo original |
| Arquivos grandes ou processamento acima do limite da requisição | Upload limitado a 15 MB; falhas ficam registradas com mensagem para nova tentativa |
| Modelo em versão preview | Modelo e tokens são auditados por nota; a extração não altera estoque sem confirmação humana |
| Confusão entre fornecedor e sistema | `INOVE` é rejeitado como fornecedor e aparece apenas como sistema de PDV/estoque |

O módulo não substitui conferência fiscal ou contábil. Ele organiza e concilia os dados para gestão de compras; o documento fiscal original permanece disponível por URL temporária e prevalece em caso de dúvida.
