# Automação de estoque em produção — Heartbeat

## Estado desta implementação

Os novos timers de detecção de abertura de caixas e a chamada nova de baixa de estoque embutida no cron de importação de vendas foram retirados de `server/cron.ts`. Os jobs legados de importação de vendas, faturamento, cache, alertas e snapshot mensal permanecem como estavam. Migrações 0040, 0041 e 0042 aplicadas no MySQL em 05/11/2026; registro global `stock-deduction` criado desabilitado, sem UID. Nenhum novo schedule foi criado nem ativado. O marco limita replay anterior à implantação, mas não substitui a conferência física do saldo-base existente.

Os callbacks são `POST /api/scheduled/stock-deduction` e `POST /api/scheduled/box-openings`, montados pelo router scheduled antes do fallback estático. Não dependem de timers ou da sessão do sandbox. O arquivo bootstrap não utilizado foi removido; os callbacks usam o SDK já existente.

## Autenticação e autorização

O callback lê somente o cookie decodificado `app_session_id`, valida sua assinatura com `sdk.verifySession`, exige identidade `cron_` e `appId` do projeto. Confirma remotamente com `sdk.getUserInfoWithJwt` o mesmo `openId`, o `projectId` e um `taskUid` não vazio. O campo cron é lido por cast local restrito, sem mudar SDK/tipos gerados. Usuários comuns, inclusive administradores, não podem executar esses callbacks. A autenticação regular e o upsert de usuário cron não são chamados.

O registry `stock_scheduled_jobs` tem `jobKey` como chave primária com três valores possíveis: `stock-deduction`, `box-dia`, `box-noite`; `schedule_cron_task_uid varchar(65)` nullable com índice único; `enabled` com default false; `createdAt` e `updatedAt`. O vínculo é consultado exclusivamente pelo `taskUid` autenticado, nunca por nome, payload ou parâmetros enviados pelo cliente. UID sem registro retorna HTTP 200 `{ ok: true, skipped: "orphan" }`. Registro desabilitado ou vinculado a endpoint incompatível retorna 403 sem executar. `stock-deduction` só pode chamar baixa; `box-dia` e `box-noite` só podem chamar caixas.

Falha de DB, OAuth indisponível, conector ausente/inativo, erro de SQL Server, erro de execução ou de notificação retorna HTTP 500 JSON com `error`, `stack`, `context` (`url`, `taskUid`, `jobKey`, `expectedJobKeys`, `phase`) e `timestamp`. Retornos legados `Banco indisponível` e `INOVE não conectado` também viram 500, não falso sucesso. Ausência real de vendas ou de caixas configuradas é 2xx. A plataforma pode repetir 5xx/429 até três vezes; limite de callback: dois minutos.

## Marco inicial: não reaplicar vendas já refletidas no estoque

Após aplicar a migration, o responsável deve inserir **uma única linha global `stock-deduction` com `enabled = false` e `schedule_cron_task_uid = NULL`**. O `createdAt` dessa linha é o marco inicial de ativação, imutável nos próximos vínculos/reativações. O estoque existente já reflete vendas anteriores; **não se deve reaplicar indiscriminadamente as últimas 24h na primeira sincronização**.

O motor de baixa deve ler esse registro e limitar as vendas a `soldAt >= createdAt`, em conjunto com a janela `hoursBack: 24` e o log por `ITEM_VENDA`. O callback chama diretamente `deductStockFromInoveSales({ hoursBack: 24 })`: a filtragem pelo marco é responsabilidade do motor, não do payload HTTP. **Antes de habilitar os schedules, verificar que o motor foi entregue com esse filtro global.** Não habilitar o Heartbeat se ele ainda puder reaplicar vendas anteriores ao marco. Usar uma data UTC explícita correspondente ao instante em que o saldo-base foi estabelecido; o exemplo abaixo contém placeholders, não uma data a executar literalmente. `UTC_TIMESTAMP()` não substitui a conciliação do saldo-base.

SQL de preparação, somente após migration e confirmação do saldo-base:

```sql
INSERT INTO stock_scheduled_jobs
  (jobKey, schedule_cron_task_uid, enabled, createdAt, updatedAt)
VALUES
  ('stock-deduction', NULL, false, '<MARCO_UTC_YYYY-MM-DD HH:MM:SS>', '<MARCO_UTC_YYYY-MM-DD HH:MM:SS>');
```

A inserção é intencionalmente sem upsert: não sobrescrever o marco de uma linha já existente. Consultar e conciliar primeiro se a linha existir. O timestamp deve ser persistido como data real; não usar o texto `now` como valor e não confundir milissegundos Unix com segundos. Trabalhar em UTC na sessão SQL.

## Sequência obrigatória de ativação

1. Aplicar a migration 0042 previamente revisada, sob responsabilidade do responsável pelo banco. Inserir a linha global desabilitada e confirmar o marco inicial/filtro no motor.
2. Salvar checkpoint e **publicar/deployar** o site com os callbacks e o motor corrigido. Confirmar que a URL de produção está disponível. Não criar jobs apontando para sandbox/dev.
3. Consultar `manus-heartbeat list` para evitar duplicação de jobs já existentes. Jobs conhecidos devem ser atualizados pelo UID, não recriados por nome.
4. Criar os três jobs **somente após deploy** usando os comandos abaixo. Registrar os `task_uid` reais retornados pela plataforma no registry; não são inventados nem extraídos do payload.
5. Habilitar as três linhas somente após conferir UID, cron e endpoint. A chamada entre criação do job e vínculo no registry será `orphan` e não alterará estoque.
6. Conferir logs de execução na plataforma e valores do banco. Não alegar automação ativa somente porque arquivos locais foram alterados.

## Comandos oficiais pós-deploy

Flags validadas localmente com `manus-heartbeat create --help`, `update --help`, `list --help`, `logs --help`, `pause --help`, `resume --help` e `delete --help`. **Só foram executados os comandos `--help`, sem criar, alterar ou listar schedules remotos.** Nesta versão do CLI, pause/resume são subcomandos próprios; `update --enable` não existe.

```bash
cd /home/ubuntu/sorveteria_duo_gelatto

# Inspeção, somente durante a etapa pós-deploy:
manus-heartbeat list

# Stock: a cada 5 minutos, cron com 6 campos, UTC.
manus-heartbeat create \
  --name stock-deduction \
  --cron '0 */5 * * * *' \
  --path /api/scheduled/stock-deduction \
  --method POST \
  --description 'Baixa INOVE, janela 24h limitada pelo marco inicial do estoque'

# Dia: 13h Brasília (UTC-3) = 16h UTC.
manus-heartbeat create \
  --name box-dia \
  --cron '0 0 16 * * *' \
  --path /api/scheduled/box-openings \
  --method POST \
  --description 'Detectar abertura de caixas às 13h Brasília'

# Noite: 21h30 Brasília = 00h30 UTC do dia seguinte.
manus-heartbeat create \
  --name box-noite \
  --cron '0 30 0 * * *' \
  --path /api/scheduled/box-openings \
  --method POST \
  --description 'Detectar abertura de caixas às 21h30 Brasília'
```

Os jobs de caixas são separados e usam o mesmo endpoint. Um único cron com listas de horas/minutos geraria execuções adicionais indevidas. Dois UIDs permitem pausar/diagnosticar cada turno independentemente. A conversão corresponde a Brasília UTC-3; se a regra civil de horário mudar, ajustar os crons.

Depois de receber os três UIDs reais, vincular no banco. O `UPDATE` do stock **não altera `createdAt`**. A checagem de UID único impede que dois jobs se apropriem do mesmo vínculo.

```sql
-- Confirmar que a linha global já existe e está desabilitada, sem UID.
SELECT jobKey, schedule_cron_task_uid, enabled, createdAt, updatedAt
FROM stock_scheduled_jobs;

UPDATE stock_scheduled_jobs
SET schedule_cron_task_uid = '<TASK_UID_STOCK>', enabled = true
WHERE jobKey = 'stock-deduction'
  AND schedule_cron_task_uid IS NULL AND enabled = false;
-- Exigir exatamente uma linha afetada; se nenhuma, investigar antes de continuar.

INSERT INTO stock_scheduled_jobs (jobKey, schedule_cron_task_uid, enabled)
VALUES
  ('box-dia', '<TASK_UID_BOX_DIA>', true),
  ('box-noite', '<TASK_UID_BOX_NOITE>', true);
-- Em reconfiguração, atualizar pelo UID anterior; nunca resetar createdAt do stock.
```

## Operação, diagnóstico e desativação

```bash
manus-heartbeat logs --task-uid '<TASK_UID>' --with-body --page-size 5
manus-heartbeat logs --task-uid '<TASK_UID>' --status failed --with-body
manus-heartbeat pause --task-uid '<TASK_UID>'
manus-heartbeat resume --task-uid '<TASK_UID>'
manus-heartbeat update --task-uid '<TASK_UID>' --cron '0 */5 * * * *'
manus-heartbeat delete --task-uid '<TASK_UID>'
```

Para desativar com segurança: colocar `enabled = false` no registro localizado pelo UID e pausar o job na plataforma. Para remover: desabilitar e excluir na plataforma; manter o marco global do estoque. Se limpar o UID de stock, manter `createdAt`; callbacks antigos passam a orphan. Retomar exige conferir o saldo-base e o log, não recriar o marco. A janela de 24h não garante recuperação de uma indisponibilidade maior que 24h; eventual backfill precisa de reconciliação específica, sem replay cego.

## Limites de idempotência existentes

A plataforma faz retries. O motor foi corrigido: log/claim único por `ITEM_VENDA`, movimentações e ambos os saldos são gravados na mesma transação, com bloqueio de linhas e rollback. A detecção de caixas e sua confirmação também compartilham bloqueios, janela temporal exclusiva no início/inclusiva no fim e fuso do PDV em São Paulo. Entradas, saídas e ajustes manuais de caixas passam a usar transação para não competir com esses movimentos. Testes isolados cobrem repetição, concorrência, erro parcial e rollback; não substituem acompanhamento real após ativação.

Antes de ativar, conferir unidades e saldos legados e vincular IDs reais do INOVE. O banco tinha 311 produtos, 123 itens operacionais (inclusive saldos em caixas/pacotes) e 59 caixas 10L, todas sem saldo e sem vínculo/rendimento configurado para detecção. Não foi fabricado saldo ou vínculo. Itens ambíguos, saldos insuficientes, quantidades fracionárias incompatíveis e embalagens ainda não convertidas ficam pendentes, sem log definitivo que impeça correção posterior.

NF-e exige revisão humana salva; fator fiscal 1 (quantidade já em unidades) versus fator da embalagem deve ser conferido, inclusive quando o fornecedor escreve UN para embalagem. Nenhuma nota antiga foi incorporada automaticamente. Importar compras históricas não prova saldo físico atual; a conferência é necessária antes de confirmar. O endpoint legado de baixa foi encaminhado ao mesmo motor, e substituir o estoque local pelo saldo INOVE foi bloqueado após inicialização para não misturar duas fontes e repetir deduções.

Estornos posteriores a uma baixa já concluída e indisponibilidade maior que a janela de 24h exigem conciliação/backfill específico. O resumo mensal legado sem snapshot não foi reescrito nesta integração; não inferir saldo inicial histórico de uma contagem atual. Os novos jobs permanecem desligados até publicação e conferência operacional, e não devem ser descritos como já ativos.
