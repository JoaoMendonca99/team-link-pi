"""Read-only preparation of the ten identification columns from Inep's IES CSV."""
import argparse, csv, hashlib, io, json, pathlib, re

COLUMNS = dict(CO_IES='codigo_inep', NO_IES='nome', SG_IES='sigla', NO_MUNICIPIO_IES='municipio', CO_MUNICIPIO_IES='codigo_municipio', SG_UF_IES='uf', TP_ORGANIZACAO_ACADEMICA='tipo_organizacao', TP_CATEGORIA_ADMINISTRATIVA='categoria_administrativa', TP_REDE='rede', NU_ANO_CENSO='ano_referencia')
UFS = set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split())

def prepare(path):
    raw = pathlib.Path(path).read_bytes()
    try: text = raw.decode('utf-8-sig'); encoding = 'utf-8-sig'
    except UnicodeDecodeError: text = raw.decode('cp1252'); encoding = 'windows-1252'
    reader = csv.DictReader(io.StringIO(text), delimiter=';')
    if not set(COLUMNS).issubset(reader.fieldnames or []): raise ValueError('Missing required CSV columns')
    records, rejected, duplicates, conflicts, total = {}, [], [], [], 0
    for line, source in enumerate(reader, 2):
        total += 1
        try:
            row = {target: re.sub(r'\s+', ' ', source[key] or '').strip() or None for key, target in COLUMNS.items()}
            for key in ['codigo_inep', 'codigo_municipio', 'tipo_organizacao', 'categoria_administrativa', 'rede', 'ano_referencia']:
                value = row[key]
                if value is not None and (not re.fullmatch(r'\d+', value) or int(value) < 1): raise ValueError('Invalid ' + key)
                row[key] = int(value) if value else None
            if not row['codigo_inep'] or row['codigo_inep'] > 99999999 or not row['nome'] or row['uf'] not in UFS: raise ValueError('Invalid institution identification')
            if row['ano_referencia'] != 2024 or row['tipo_organizacao'] not in range(1, 6) or row['categoria_administrativa'] not in [1, 2, 3, 4, 5, 7] or row['rede'] not in [1, 2]: raise ValueError('Invalid dictionary classification for 2024')
            if '\ufffd' in ''.join(str(v) for v in row.values() if v is not None): raise ValueError('Invalid decoding')
            previous = records.get(row['codigo_inep'])
            if previous:
                (duplicates if previous == row else conflicts).append({'line': line, 'codigo_inep': row['codigo_inep']})
            else: records[row['codigo_inep']] = row
        except (ValueError, TypeError) as error: rejected.append({'line': line, 'reason': str(error)})
    rows = sorted(records.values(), key=lambda r: r['codigo_inep'])
    report = dict(source_file=pathlib.Path(path).name, source_url='https://www.gov.br/inep/pt-br/acesso-a-informacao/dados-abertos/microdados/censo-da-educacao-superior', source_sha256=hashlib.sha256(raw).hexdigest(), encoding=encoding, delimiter=';', columns=COLUMNS, total_read=total, distinct_institutions=len(rows), valid_records=total-len(rejected)-len(conflicts), duplicates=duplicates, conflicts=conflicts, rejected=rejected, without_acronym=sum(r['sigla'] is None for r in rows), prepared=len(rows))
    assert hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest() == report['source_sha256']
    return rows, report

if __name__ == '__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('csv'); parser.add_argument('--out',default='data/institutions'); args=parser.parse_args()
    rows, report=prepare(args.csv); out=pathlib.Path(args.out); out.mkdir(parents=True,exist_ok=True)
    (out/'import-report-2024.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    if report['conflicts'] or report['rejected']: raise SystemExit('Conflicts/rejections found; inspect report before import')
    (out/'inep-ies-2024.json').write_text(json.dumps(rows,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k not in ['columns']},ensure_ascii=True))
