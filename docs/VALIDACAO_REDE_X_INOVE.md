# Validação real — Rede x INOVE

Foram processadas sem gravação duas planilhas reais da Rede para validar o importador e a conciliação. O parser foi corrigido para interpretar moeda e percentuais formatados, horários seriais do Excel e considerar somente transações aprovadas ou pagas que não estejam canceladas.

| Arquivo | Registros válidos | Período | Total bruto | Total líquido |
|---|---:|---|---:|---:|
| Rede julho/2026 | 2.082 | 01/07 a 28/07 | R$ 81.254,44 | R$ 62.579,86 |
| Rede agosto/2026 | 900 | 01/08 a 11/08 | R$ 33.168,60 | R$ 32.587,17 |

Na planilha de julho, 39 transações expiradas e 47 negadas foram corretamente excluídas. Nenhum valor ou data ficou inválido após a correção. Em agosto, o NSU `186184990` aparece em duas vendas legítimas, ocorridas em datas, horários e valores diferentes; por isso, nenhuma delas foi removida.

A planilha de agosto foi importada pelo endpoint autenticado real com o usuário administrador. O MySQL confirmou o arquivo `id=1`, **900 vendas**, total bruto de **R$ 33.168,60**, total líquido de **R$ 32.587,17**, nenhum status inválido e nenhum horário inválido. Uma tentativa de repetir o mesmo arquivo é bloqueada pela combinação de nome, quantidade e total.

A primeira conciliação persistida revelou um erro adicional: como o arquivo está em ordem decrescente, o sistema usava 11/08 como início e 01/08 como fim. O período passou a ser calculado pela menor e maior data. A consulta do INOVE também passou a incluir PIX e vouchers, distinguir cada linha de pagamento de vendas divididas e exigir modalidade compatível.

| Conciliação | Correspondências | Pendentes | Cobertura |
|---|---:|---:|---:|
| Julho — validação sem gravação | 2.044 de 2.082 | 38 | 98,17% |
| Agosto — persistida no MySQL | 845 de 900 | 55 | 93,89% |

Em agosto, as 845 correspondências totalizam R$ 32.241,14. As 55 vendas sem correspondência totalizam R$ 927,46 e permanecem visíveis para conferência, sem criação de vínculos forçados.
