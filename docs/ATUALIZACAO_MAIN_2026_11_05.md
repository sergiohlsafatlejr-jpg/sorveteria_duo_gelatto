# Integração main — 05/11/2026

## Origem e publicação

Repositório autorizado: `sergiohlsafatlejr-jpg/sorveteria_duo_gelatto`, branch `main`. Pull fast-forward efetuado no remoto GitHub já configurado (`user_github`), preservando `origin` como remoto interno de checkpoints Manus. Commits incorporados em sequência: `aef75a6`, `673f56e`, `84846b5`. Meta do Dia e política financeira exclusiva do administrador foram preservadas.

A versão integrada foi validada na prévia, não em produção. A publicação depende do botão Publicar no checkpoint. A ativação e a prova real de execução dos novos agendamentos são posteriores à publicação e à conferência do saldo-base/vínculos.

## MySQL

Aplicadas as estruturas pendentes de 0040 e 0041 após inspeção dos campos existentes, sem apagar/recriar tabelas de negócio. Criados `box_open_tracking`, `inove_stock_deduction_log`, os campos de rendimento/vínculo INOVE em caixas e os campos de vínculo/conversão em produtos/itens operacionais. Migração adicional 0042 cria somente `stock_scheduled_jobs`, para vínculo seguro dos callbacks de produção.

Esquema final com 63 tabelas e os cinco campos requisitados verificados. `pnpm drizzle-kit generate` informou ausência de novas diferenças. Registro global `stock-deduction` criado desabilitado, sem UID, como corte temporal para não reaplicar vendas anteriores à integração. Esse corte não prova que os saldos legados já estejam conciliados com o estoque físico.

Estoque existente auditado: 311 produtos, 123 itens operacionais com diversas unidades e 59 caixas 10L. Não se atribuiu automaticamente saldo, rendimento ou vínculo INOVE às caixas. Nenhuma NF-e foi confirmada ou título financeiro criado durante a validação.

## Proteções acrescentadas à versão recebida

- Baixa INOVE: transação engloba claim/log único por ITEM_VENDA, saldos e movimentações; bloqueios e rollback protegem retry e concorrência. Vendas estornadas antes da leitura, itens kg/10L, vínculos ambíguos, quantidades incompatíveis e saldos insuficientes não produzem baixa incorreta. Saldo operacional legado em embalagens exige conversão prévia.
- Caixas: cursor no fuso São Paulo com limites temporais definidos, detecção e confirmação sob bloqueio; não confirma caixa sem saldo, sem sugestão ou sem rendimento válido. Movimentações manuais passam a usar transação e não permitem saída superior ao saldo.
- NF-e: revisão humana salva é obrigatória; fator 1 versus fator da embalagem é mostrado e aprovado antes de confirmar, evitando multiplicar novamente quantidades já unitárias. Revisão/reprocessamento não reabrem documentos confirmados. Catálogo ambíguo e mistura de saldos antigos em caixas com unidades novas ficam bloqueados.
- Caminho legado de dedução encaminhado ao motor novo; sobrescrita do saldo local pelo INOVE bloqueada após inicialização do estoque unificado.
- Financeiro: liquidez não soma previsão integral de hoje às vendas reais do mesmo dia; respeita status e prazos registrados da Rede. Recuperação semanal não cobra déficit duas vezes e mantém hoje aberto. Mix de modalidades deve somar 100%.
- Clima ausente não produz diagnóstico operacional falso; chuva de pico usa probabilidade e precipitação de 13h a 20h. Fator de chuva zero e data civil São Paulo são preservados. Painéis são invalidados após alterações financeiras.
- Parcelas fiscais: lote transacional, bloqueio da nota e marcador persistente de NF-e/parcela impedem clique/retry duplicado e gravação parcial.

## Validação executada

`pnpm check`: aprovado. `NODE_OPTIONS=--max-old-space-size=2048 pnpm build`: aprovado (aviso de chunks grandes, sem erro). Suíte completa: 266 testes aprovados em 30 arquivos; cinco testes de integração em dois arquivos foram pulados explicitamente para não gravar fixtures no banco de produção. Não há testes de falha esperada mascarando as regressões financeiras novas.

Servidor reiniciado e HTTP 200. Oito consultas autenticadas reais retornaram HTTP 200: sessão, Meta do Dia, lista de caixas, sugestões de abertura e quatro consultas de inteligência financeira. Rotinas mutáveis de estoque e geração de títulos não foram chamadas para teste no banco real.

Desktop 1440 px e celular 390 px: Dashboard, caixas, notas fiscais, relatório semanal, recebíveis, Forecast e metas. Sem erro JavaScript capturado; largura excedente dos três painéis financeiros foi corrigida e revalidada. A tela de metas foi reaberta após o último reinício para descartar captura em carregamento. Sessão temporária e scripts de teste ficam fora do repositório e são removidos ao encerrar a validação.

## Pendências e limites

1. Publicar o checkpoint e validar o commit efetivamente servido em produção autenticada; pendências antigas de validação de metas/relatório de agosto não foram marcadas como concluídas.
2. Conferir saldo físico e unidades legadas, associar IDs reais/rendimento das caixas e só então criar/vincular os novos agendamentos persistentes. Preparação em `AUTOMACAO_ESTOQUE_PRODUCAO.md`; nenhum novo job está ativo.
3. Estornos posteriores à baixa e indisponibilidade acima da janela de 24 horas exigem conciliação/backfill específico. Não inferir estoque inicial histórico sem snapshot a partir do saldo atual. O resumo mensal legado sem snapshot não foi reescrito nesta integração.
4. Detecção de consumo das caixas gera sugestão de abertura; a confirmação humana é preservada, conforme o módulo recebido. Não é uma autorização para confirmar automaticamente as notas fiscais antigas.
