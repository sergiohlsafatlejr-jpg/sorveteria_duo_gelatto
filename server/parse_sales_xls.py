#!/usr/bin/env python3
"""
Parser para os relatórios XLS da Sorveteria Duo Gelatto.
Recebe dois arquivos via stdin (paths em JSON) e retorna JSON com os dados parseados.

Uso: python3 parse_sales_xls.py <caixa.xls> <produtos.xls>
"""

import sys
import json
import xlrd
from datetime import datetime

def parse_caixa(filepath):
    """Parseia o relatório de Movimentação de Recebimentos (vendas por caixa)."""
    wb = xlrd.open_workbook(filepath)
    sh = wb.sheets()[0]
    
    # Encontrar linha de cabeçalho (contém 'VENDA', 'CAIXA', 'FORMA PGTO')
    header_row = -1
    for r in range(sh.nrows):
        row = [str(sh.cell_value(r, c)).strip() for c in range(sh.ncols)]
        if 'VENDA' in row and 'FORMA PGTO' in row:
            header_row = r
            break
    
    if header_row < 0:
        return {"error": "Cabeçalho não encontrado no arquivo de caixa"}
    
    # Mapear colunas pelo cabeçalho
    headers = [str(sh.cell_value(header_row, c)).strip() for c in range(sh.ncols)]
    col = {}
    for i, h in enumerate(headers):
        if h == 'VENDA': col['venda'] = i
        elif h == 'CAIXA': col['caixa'] = i
        elif h == 'DATA TRANSAÇÃO': col['data'] = i
        elif h == 'FORMA PGTO': col['forma'] = i
        elif h == 'BANDEIRA': col['bandeira'] = i
        elif h == 'V. PAGAMENTO': col['valor'] = i
        elif h == 'JURO(S)': col['juros'] = i
        elif h == 'V.RECEBER': col['receber'] = i
    
    transactions = []
    payments_summary = {}
    
    for r in range(header_row + 1, sh.nrows - 5):
        row = [sh.cell_value(r, c) for c in range(sh.ncols)]
        
        venda = str(row[col.get('venda', 2)]).strip()
        forma = str(row[col.get('forma', 14)]).strip()
        valor = row[col.get('valor', 20)]
        
        # Linha de dados válida: tem número de venda e forma de pagamento
        if not venda or venda in ('', 'VENDA', 'nan') or not forma or forma in ('', 'FORMA PGTO', 'nan'):
            continue
        if not isinstance(valor, float) or valor <= 0:
            continue
        
        data_str = str(row[col.get('data', 8)]).strip()
        
        transactions.append({
            'venda': venda,
            'caixa': str(row[col.get('caixa', 5)]).strip(),
            'data': data_str,
            'forma': forma,
            'bandeira': str(row[col.get('bandeira', 18)]).strip(),
            'valor': round(valor, 2),
            'juros': round(float(row[col.get('juros', 23)]) if isinstance(row[col.get('juros', 23)], float) else 0, 2),
            'receber': round(float(row[col.get('receber', 27)]) if isinstance(row[col.get('receber', 27)], float) else valor, 2),
        })
        
        # Agregar por forma de pagamento
        if forma not in payments_summary:
            payments_summary[forma] = {'total': 0, 'count': 0}
        payments_summary[forma]['total'] = round(payments_summary[forma]['total'] + valor, 2)
        payments_summary[forma]['count'] += 1
    
    total = sum(t['valor'] for t in transactions)
    
    return {
        'transactions': transactions,
        'payments_summary': [
            {'method': k, 'total': round(v['total'], 2), 'count': v['count']}
            for k, v in sorted(payments_summary.items(), key=lambda x: -x[1]['total'])
        ],
        'total_revenue': round(total, 2),
        'total_transactions': len(transactions),
    }


def parse_produtos(filepath):
    """Parseia o relatório de Produtos Vendidos."""
    wb = xlrd.open_workbook(filepath)
    sh = wb.sheets()[0]
    
    # Encontrar linha de cabeçalho (contém 'Código', 'Descrição', 'Quantidade')
    header_row = -1
    for r in range(sh.nrows):
        row = [str(sh.cell_value(r, c)).strip() for c in range(sh.ncols)]
        if 'Código' in row and 'Descrição' in row and 'Quantidade' in row:
            header_row = r
            break
    
    if header_row < 0:
        return {"error": "Cabeçalho não encontrado no arquivo de produtos"}
    
    headers = [str(sh.cell_value(header_row, c)).strip() for c in range(sh.ncols)]
    col = {}
    for i, h in enumerate(headers):
        if h in ('Código', 'Codigo', 'C\u00f3digo'): col['codigo'] = i
        elif h in ('Descrição', 'Descricao', 'Descri\u00e7\u00e3o'): col['descricao'] = i
        elif h == 'Unid.': col['unidade'] = i
        elif h == 'Quantidade': col['qtd'] = i
        elif h == 'Pr. Venda': col['preco'] = i
        elif h == 'Pr. Venda Total': col['total'] = i
    
    # Fallback: se não encontrou pelo cabeçalho, usar índices fixos conhecidos do layout do PDV
    # Cabeçalho na col 3, mas dados na col 2 (código), col 5 (nome), col 11 (unid), col 16 (qtd), col 19 (preco), col 23 (total)
    if 'codigo' not in col:
        col = {'codigo': 2, 'descricao': 5, 'unidade': 11, 'qtd': 16, 'preco': 19, 'total': 23}
    
    items = []
    
    for r in range(header_row + 1, sh.nrows - 5):
        row = [sh.cell_value(r, c) for c in range(sh.ncols)]
        
        # O código do PDV está sempre na coluna 2 (dados), mesmo que o cabeçalho 'Código' esteja na col 3
        cod = row[2]  # Coluna fixa: código do produto no PDV
        desc = str(row[col.get('descricao', 5)]).strip()
        qtd = row[col.get('qtd', 16)]
        preco = row[col.get('preco', 19)]
        total = row[col.get('total', 23)]
        
        # Linha válida: tem código numérico, descrição e quantidade
        if not isinstance(cod, float) or not desc or desc in ('', 'Descrição', 'nan'):
            continue
        if not isinstance(qtd, float) or qtd <= 0:
            continue
        
        unidade = str(row[col.get('unidade', 12)]).strip() if col.get('unidade') is not None else 'UND'
        
        items.append({
            'external_code': str(int(cod)),
            'external_name': desc,
            'unit': unidade if unidade and unidade != 'nan' else 'UND',
            'quantity': round(qtd, 3),
            'unit_price': round(float(preco) if isinstance(preco, float) else 0, 2),
            'total_price': round(float(total) if isinstance(total, float) else 0, 2),
        })
    
    total_revenue = sum(i['total_price'] for i in items)
    total_units = sum(i['quantity'] for i in items)
    
    return {
        'items': items,
        'total_revenue': round(total_revenue, 2),
        'total_items': len(items),
        'total_units': round(total_units, 0),
    }


def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Uso: parse_sales_xls.py <caixa.xls> <produtos.xls>"}))
        sys.exit(1)
    
    caixa_path = sys.argv[1]
    produtos_path = sys.argv[2]
    
    try:
        caixa_data = parse_caixa(caixa_path)
    except Exception as e:
        caixa_data = {"error": str(e)}
    
    try:
        produtos_data = parse_produtos(produtos_path)
    except Exception as e:
        produtos_data = {"error": str(e)}
    
    result = {
        "caixa": caixa_data,
        "produtos": produtos_data,
    }
    
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
