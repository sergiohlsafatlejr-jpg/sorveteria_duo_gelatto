# Controle de acesso ao módulo Financeiro

O módulo **Financeiro** passou a ser exclusivo do perfil **Administrador**. Os perfis Gerente/Colaborador, Funcionário e Usuário não podem receber acesso financeiro, mesmo que uma permissão antiga esteja gravada no MySQL.

| Camada | Proteção aplicada |
|---|---|
| Menu | Todo o grupo Financeiro é ocultado para não administradores. |
| URL direta | Rotas `/fin/*` e a rota legada `/finance` redirecionam para Acesso Negado com notificação amigável. |
| Backend tRPC | Financeiro, metas de produtos, conciliação Rede e análise de otimização usam uma barreira administrativa central. |
| Upload Express | A importação de planilhas Rede retorna HTTP 403 para não administradores. |
| Dashboard inicial | Metas financeiras não são consultadas nem exibidas para perfis restritos. |
| Cadastro de usuários | O grupo e o perfil Financeiro não aparecem para não administradores; o backend remove qualquer tentativa de concessão. |
| Banco de dados | Permissões financeiras antigas de não administradores foram revogadas. |

A validação com o usuário Gerente real confirmou zero permissões financeiras ativas. Os endpoints `fin.dashboard`, `productGoals.list` e `rede.listImports` retornaram `FORBIDDEN`; os contadores de contas a pagar e receber retornaram zero, mantendo apenas o alerta operacional de estoque.

Foram executados 12 testes de autorização, cobrindo Gerente, Funcionário, Usuário, Administrador, rotas financeiras e endpoints reais. A checagem TypeScript e o build de produção foram aprovados.

A validação visual autenticada confirmou que o Gerente não vê o grupo Financeiro e é redirecionado para **Acesso Restrito** ao abrir uma URL `/fin/*`, com toast explicativo. A sessão administrativa permaneceu com acesso normal ao Dashboard Financeiro. Após incluir também os endpoints DRE e DRE por canal, a suíte passou a totalizar **14 testes de autorização aprovados**.
