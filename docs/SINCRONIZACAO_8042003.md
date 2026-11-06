# Sincronização 8042003 — 06/11/2026

## Origem e escopo

Pull fast-forward de `89aa28e` para `8042003` da branch main do repositório `sergiohlsafatlejr-jpg/sorveteria_duo_gelatto`. O remoto GitHub do projeto é `user_github`; `origin` interno do Manus foi preservado. Não houve operação no repositório safatle-sistema.

Commit: `feat(estoque,clima,metas,fin): grupos clicaveis de baixo estoque, ajuste direto, potencial climatico e edicao de metas/avisos`. Nenhuma alteração de schema, migração ou dependência; não foi executado `db:push`, SQL de migração ou alteração de estrutura no banco.

## Ajustes necessários antes da publicação

A revisão identificou defeitos de integridade novos no caminho de ajuste e inicialização de estoque. O formulário não envia remoção de vínculo INOVE para uma caixa cujo campo não foi editado. O backend conserva vínculo omitido e permite remoção apenas explicitamente enviada.

O ajuste de caixas grava saldo e histórico na mesma transação, sob bloqueio. A inicialização em lote reconsulta/bloqueia os cadastros no servidor, pula itens ativos existentes inclusive saldo zero, deduplica nomes e não reaplica quantidades históricas sobre estoque já configurado. A transação pode repetir somente deadlocks MySQL reconhecidos, com limite de três tentativas. Regex de nomes 10 Litros/10LT/10L foi corrigido para não truncar o nome do sabor. Não se adicionou schema para implementar essas proteções.

Cabeçalho e abas de Produtos foram adaptados para celular após a verificação detectar largura excedente. As demais interfaces recebidas foram preservadas.

## Validação

Suíte completa: 290 testes aprovados em 31 arquivos. Cinco testes de integração em dois arquivos ficaram explicitamente pulados para não gravar fixtures no banco real. Foram acrescentados 24 testes isolados de preservação de vínculo, remoção explícita, locks, rollback, lote/retry, concorrência e nomes das caixas; mocks não constituem um teste de bloqueios com concorrência no MySQL real. `pnpm check` aprovado.

Build final aprovado com limite de memória de 2048 MB (aviso de chunks grandes, sem erro). Prévia reiniciada. Carregamento autenticado de Produtos, Compras/Sorvetes, Forecast/Potencial Climático, Metas/Avisos e Recebíveis validado em desktop e 390 px. As três consultas de inteligência consultadas retornaram HTTP 200. Grupo de estoque, formulário rápido, ajuste de compras e editor semanal foram abertos sem salvar. Nenhum estoque ou título financeiro foi criado para teste; as consultas refletem os dados reais existentes.

## Estado de publicação e observações

Salvar checkpoint libera o botão Publicar, mas não prova que a atualização esteja servida em produção. Não há ferramenta independente de deploy nesta sessão; publicação segue a interface WebDev/auto-publicação configurada. A validação efetiva da versão publicada permanece pendente até evidência de deploy desta versão. Os agendamentos de estoque antigos pendentes não foram ativados nesta sincronização.

A revisão financeira restrita não encontrou bloqueio impeditivo. Duas observações não impeditivas da implementação recebida foram registradas para eventual ajuste posterior: ticket customizado não é restaurado no campo ao reabrir Metas, e salvar apenas um aviso semanal também grava valores exibidos como overrides, fixando as metas automáticas. Não foram alteradas nesta sincronização, nem testadas por gravação em produção.
