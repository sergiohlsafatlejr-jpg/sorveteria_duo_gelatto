# KPI Meta do Dia no Dashboard

O primeiro KPI do Dashboard principal passou a comparar o faturamento realizado no dia com a meta diária configurada no Forecast/Previsão de Faturamento.

Na validação de 3 de setembro de 2026, o Forecast retornou meta de **R$ 3.078,51** com descrição **Meta de Gerência**. O INOVE retornou **R$ 291,59** realizados, equivalentes a **9%**, com **R$ 2.786,92** restantes. O card foi exibido em vermelho e identificado como **PDV INOVE ao vivo**.

O estado verde é ativado quando o realizado alcança ou supera a meta. Em dias sem meta configurada, o card assume estado neutro e informa que a meta não foi cadastrada no Forecast.

A validação autenticada pós-build em 390 × 844 px confirmou o KPI legível, os quatro cards com altura visual uniforme e ausência de overflow horizontal (`scrollWidth = 390`).
