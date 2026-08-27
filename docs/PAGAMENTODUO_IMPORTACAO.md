# Mapeamento do arquivo PagamentoDuo.xlsx

**Autor:** Manus AI  
**Data da análise:** 27 de agosto de 2026

O arquivo `PagamentoDuo.xlsx` pertence ao módulo **Financeiro → Contas a Pagar** e deve ser persistido na tabela `fin_transactions`. Ele não pertence à conciliação Rede, pois não contém NSU, valor líquido, taxa MDR, bandeira, data da venda ou demais campos de liquidação da adquirente.

| Coluna do arquivo | Destino no sistema | Regra |
| --- | --- | --- |
| Descricao | `fin_transactions.description` | Texto obrigatório do lançamento |
| Valor | `fin_transactions.amount` | Converter moeda com separador de milhar e decimal |
| Vencimento | `fin_transactions.dueDate` | Interpretar as datas do Excel no ano de 2026 |
| Pago | `fin_transactions.isPaid` | `PG` significa pago; vazio significa pendente |
| Custo | `fin_transactions.costId` | Vincular pelo nome do custo quando existir; caso contrário, salvar `NULL` e informar o rótulo nas observações |

| Resumo validado | Resultado |
| --- | ---: |
| Linhas de dados | 61 |
| Período | 24/08/2026 a 30/09/2026 |
| Valor total | R$ 168.883,59 |
| Linhas marcadas como pagas | 5 |
| Valor pago | R$ 6.487,71 |
| Duplicidades exatas no arquivo | 0 |

Antes da importação, o parser deve reconhecer valores como `R$ 2,430.86` como **R$ 2.430,86**, aceitar `PG` como status pago e impedir que textos como `SORVETE` sejam convertidos em `NaN`. A importação também deve verificar lançamentos existentes pela combinação de descrição, valor e vencimento para evitar duplicação em reenvios.

## Custos cadastrados e cobertura

O dry-run reconheceu nove rótulos por nome ou alias: `SORVETE`, `GULOSEIMA`, `ENERGIA`, `EMPRESTIMOS`, `COPOS`, `SEGURO`, `CONTABILIDADE`, `ALUGUEL` e `CUSTO PESSOAL`. Dez rótulos ainda não têm custo correspondente: `CARTAO DE CREDITO`, `CONSTRUCAO`, `FRUTAS`, `IMPOSTOS`, `INTERNET`, `LIMPEZA`, `MARKETING`, `SANEAGO`, `SEGURANCA` e `SISTEMA`. Esses lançamentos são importados com `costId = NULL` e o rótulo original preservado nas observações.

O importador completo foi executado em modo `dryRun`: 61 linhas válidas, zero ignoradas, zero duplicidades e nenhuma alteração na quantidade de transações do banco.

## Resultado da importação e correção de setembro

A importação real persistiu 61 lançamentos e não criou duplicidades exatas por descrição, valor e vencimento. O lançamento `DUO GELATTO` de R$ 2.430,86 foi gravado corretamente com custo Duo Gelatto, categoria Sorvetes e banco Itaú, confirmando que o erro `costId = NaN` foi eliminado.

| Validação de setembro de 2026 | Resultado |
| --- | ---: |
| Lançamentos | 46 |
| Valor total atualmente persistido | R$ 134.195,46 |
| Com banco Itaú | 46 |
| Com categoria vinculada | 39 |
| Com custo vinculado | 38 |
| Sem categoria correspondente | 7 |
| Sem custo cadastrado | 8 |

Os custos ainda não cadastrados são `CONSTRUCAO`, `LIMPEZA` (três lançamentos), `MARKETING`, `SANEAGO`, `SEGURANCA` e `SISTEMA`. As categorias ainda sem correspondência segura são `CONSTRUCAO`, `LIMPEZA`, `SEGURANCA`, `SISTEMA` e um lançamento de `INTERNET`, pois existem duas categorias com esse mesmo nome. Esses registros foram preservados sem associação forçada.

Todos os 46 lançamentos de setembro receberam automaticamente o único banco cadastrado, **Itaú**. Os custos e categorias foram associados por nome ou alias somente quando havia uma correspondência única. O importador futuro repete essa regra e não escolhe automaticamente quando existem dois cadastros com o mesmo nome.

A reconciliação linha a linha encontrou uma divergência: o arquivo contém `INOVE` em 01/09/2026 por **R$ 287,56**, enquanto o banco possui **R$ 371,56**, diferença de **R$ 84,00**. O valor persistido não foi alterado, pois a solicitação atual autorizou somente vínculos de custo, banco e categoria.
