"""Stream only course identification fields; never rewrite the official CSV."""
import argparse, codecs, collections, csv, hashlib, json, pathlib, re, unicodedata

COLUMNS = ['CO_CURSO','NO_CURSO','CO_IES','CO_CINE_ROTULO','NO_CINE_ROTULO','CO_CINE_AREA_GERAL','NO_CINE_AREA_GERAL','CO_CINE_AREA_ESPECIFICA','NO_CINE_AREA_ESPECIFICA','CO_CINE_AREA_DETALHADA','NO_CINE_AREA_DETALHADA','TP_GRAU_ACADEMICO','TP_NIVEL_ACADEMICO','TP_MODALIDADE_ENSINO','NU_ANO_CENSO','TP_DIMENSAO']
SOURCE = 'https://www.gov.br/inep/pt-br/acesso-a-informacao/dados-abertos/microdados/censo-da-educacao-superior'
DICTIONARY = 'https://download.inep.gov.br/microdados/microdados_censo_da_educacao_superior_2024.zip'

def normalized(value):
    value = ''.join(c for c in unicodedata.normalize('NFD',value.lower()) if unicodedata.category(c)!='Mn')
    return re.sub(r'[\W_]+', ' ', value).strip()

def identity(name, cine, degree, level):
    return hashlib.md5('\x1f'.join([normalized(name),cine or '',str(degree or ''),str(level)]).encode()).hexdigest()

def canonical_name(name, cine, degree, level):
    # Both official names carry 0714E04/Bacharelado/Graduação. This explicit,
    # documented equivalence does not generalize to other names/classifications.
    if normalized(name)=='engenharia da computacao' and (cine,degree,level)==('0714E04',1,1):
        return 'Engenharia De Computação'
    return name

def fingerprint(path):
    digest=hashlib.sha256()
    with pathlib.Path(path).open('rb') as source:
        for block in iter(lambda:source.read(1024*1024),b''):digest.update(block)
    return digest.hexdigest()

def detect_encoding(path):
    decoder=codecs.getincrementaldecoder('utf-8-sig')()
    try:
        with pathlib.Path(path).open('rb') as source:
            for block in iter(lambda:source.read(1024*1024),b''):decoder.decode(block)
        decoder.decode(b'',final=True)
        return 'utf-8-sig'
    except UnicodeDecodeError:return 'cp1252'

def clean_code(value, pattern, nullable=False):
    value=value.strip()
    # The source contains literal extra quotes around some character codes.
    if value.startswith('"') and value.endswith('"'):value=value[1:-1]
    if nullable and not value:return None
    if not re.fullmatch(pattern,value):raise ValueError('Invalid classification code: '+repr(value))
    return value

def prepare(path, institutions):
    source_hash=fingerprint(path);encoding=detect_encoding(path)
    offers={};cines={};dimensions=collections.Counter();names=set();raw_names=set();source_cines=set();source_ies=set();pairs=set()
    conflicts={};rejected=[];hierarchy={};areas={k:set() for k in ('general','specific','detailed')}
    missing_cine_rows=0;total=0
    with pathlib.Path(path).open(encoding=encoding,newline='') as source:
        reader=csv.reader(source,delimiter=';');header=next(reader)
        if not set(COLUMNS).issubset(header):raise ValueError('Missing required course columns')
        indexes=[header.index(k) for k in COLUMNS]
        for line,values in enumerate(reader,2):
            total+=1
            try:
                raw_names.add(values[indexes[1]].strip())
                r={k:re.sub(r'\s+',' ',values[i]).strip() for k,i in zip(COLUMNS,indexes)}
                dimensions[r['TP_DIMENSAO']]+=1;names.add(r['NO_CURSO']);source_cines.add(r['CO_CINE_ROTULO'].strip('"'));source_ies.add(r['CO_IES']);pairs.add((r['CO_CURSO'],r['CO_IES']))
                if any(not r[k] for k in ('CO_CURSO','CO_IES','NO_CURSO')):raise ValueError('Incomplete course identification')
                if any(not re.fullmatch(r'\d{1,8}',r[k]) or int(r[k])<1 for k in ('CO_CURSO','CO_IES')):raise ValueError('Invalid official identifier')
                code,ies=int(r['CO_CURSO']),int(r['CO_IES']);degree=int(r['TP_GRAU_ACADEMICO']) if r['TP_GRAU_ACADEMICO'] else None
                level,mode,year,dimension=map(int,(r['TP_NIVEL_ACADEMICO'],r['TP_MODALIDADE_ENSINO'],r['NU_ANO_CENSO'],r['TP_DIMENSAO']))
                if degree not in (None,1,2,3,4) or level not in (1,2) or mode not in (1,2) or year!=2024 or dimension not in (1,2,3,4):raise ValueError('Invalid dictionary classification')
                if (mode==1)!=(dimension==1):raise ValueError('Dimension conflicts with modality')
                cine=clean_code(r['CO_CINE_ROTULO'],r'\d{4}[A-Z]\d{2}',True)
                if cine is None:missing_cine_rows+=1
                codes=[clean_code(r[k],pattern,True) for k,pattern in [('CO_CINE_AREA_GERAL',r'\d{2}'),('CO_CINE_AREA_ESPECIFICA',r'\d{3}'),('CO_CINE_AREA_DETALHADA',r'\d{4}')]]
                if cine:
                    if any(c is None for c in codes) or not(cine.startswith(codes[2]) and codes[2].startswith(codes[1]) and codes[1].startswith(codes[0])):raise ValueError('Inconsistent Cine hierarchy')
                    definition=[cine,r['NO_CINE_ROTULO'],codes[0],r['NO_CINE_AREA_GERAL'],codes[1],r['NO_CINE_AREA_ESPECIFICA'],codes[2],r['NO_CINE_AREA_DETALHADA'],year]
                    if any(not definition[i] for i in (1,3,5,7)):raise ValueError('Incomplete Cine names')
                    if cine in cines and cines[cine]!=definition:raise ValueError('Conflicting Cine label')
                    cines[cine]=definition
                    for tier,area_code,area_name,parent in [('general',codes[0],definition[3],None),('specific',codes[1],definition[5],codes[0]),('detailed',codes[2],definition[7],codes[1])]:
                        area=(tier,area_code)
                        if area in hierarchy and hierarchy[area]!=(area_name,parent):raise ValueError('Conflicting Cine area')
                        hierarchy[area]=(area_name,parent);areas[tier].add(area_code)
                record=[code,ies,r['NO_CURSO'],cine,degree,level,mode,year]
                if code in offers:
                    if offers[code]['record']!=record:conflicts.setdefault(code,[]).append(line)
                    offers[code]['dimensions'].add(dimension);offers[code]['lines']+=1
                else:offers[code]=dict(record=record,dimensions={dimension},lines=1)
            except (ValueError,IndexError,TypeError) as error:rejected.append({'line':line,'reason':str(error)})
    if fingerprint(path)!=source_hash:raise ValueError('Original CSV changed during preparation')
    courses={};offer_rows=[];homonyms=collections.defaultdict(set);cine_courses=collections.defaultdict(set);missing_institutions=set();repeated_dimensions=collections.Counter()
    for code,item in sorted(offers.items()):
        code,ies,original,cine,degree,level,mode,year=item['record']
        name=canonical_name(original,cine,degree,level);key=identity(name,cine,degree,level)
        course=courses.setdefault(key,dict(key=key,nome=name,cine=cine,grau=degree,nivel=level,aliases=set()))
        course['aliases'].update((original,name))
        if (normalized(name),cine,degree,level)==('engenharia de computacao','0714E04',1,1):course['aliases'].update(('Engenharia da Computação','Eng. de Computação'))
        homonyms[normalized(name)].add((cine,degree,level));cine_courses[cine].add(key)
        if ies not in institutions:missing_institutions.add(ies)
        dims=sorted(item['dimensions']);repeated_dimensions[','.join(map(str,dims))]+=1
        offer_rows.append([code,ies,key,cine,mode,degree,level,year,dims,original])
    course_rows=[[c['key'],c['nome'],c['cine'],c['grau'],c['nivel'],sorted(c['aliases'])] for c in sorted(courses.values(),key=lambda c:c['key'])]
    report=dict(source_file=pathlib.Path(path).name,source_url=SOURCE,dictionary_url=DICTIONARY,source_sha256=source_hash,encoding=encoding,delimiter=';',columns=COLUMNS,total_rows=total,distinct_course_codes=len(offers),distinct_names=len(raw_names),names_after_whitespace_cleanup=len(names),distinct_cine_codes=len(source_cines),institutions=len(source_ies),course_institution_pairs=len(pairs),repeated_rows=total-len(offers),course_code_conflicts=len(conflicts),conflicts=conflicts,rejected=rejected,courses_without_cine=sum(o['record'][3] is None for o in offers.values()),rows_without_cine=missing_cine_rows,dimension_row_counts=dict(dimensions),offer_dimension_groups=dict(repeated_dimensions),cine_area_counts={k:len(v) for k,v in areas.items()},canonical_courses=len(course_rows),cine_classifications=len(cines),institutional_offers=len(offer_rows),aliases=sum(len({normalized(a) for a in c[5]}) for c in course_rows),missing_institutions=sorted(missing_institutions),homonyms_kept_separate=sum(len(v)>1 for v in homonyms.values()),cine_labels_with_distinct_courses=sum(len(v)>1 for v in cine_courses.values()),identity_rule='Exact normalized official name + Cine label + degree + level; no fuzzy merging. Explicit reviewed equivalence: Engenharia da Computação -> Engenharia de Computação only for 0714E04/1/1. Modality/institution/dimension are offer properties.',offer_key='CO_CURSO; 2024 inspection found one institution and one consistent set of course attributes per code. Geographic dimensions are consolidated, retained as an array, not separate offerings.',dictionary_codes={'grau':{'1':'Bacharelado','2':'Licenciatura','3':'Tecnológico','4':'Bacharelado e Licenciatura','null':'Não aplicável (ABI/sequencial)'},'nivel':{'1':'Graduação','2':'Sequencial de Formação Específica'},'modalidade':{'1':'Presencial','2':'A distância'},'dimensao':{'1':'Presencial no Brasil','2':'A distância no Brasil','3':'A distância, agregado Brasil','4':'A distância no exterior'}})
    return course_rows,[cines[k] for k in sorted(cines)],offer_rows,report

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('csv');parser.add_argument('--out',default='data/courses');args=parser.parse_args()
    known={r['codigo_inep'] for r in json.loads((pathlib.Path(__file__).parents[1]/'data/institutions/inep-ies-2024.json').read_text(encoding='utf-8'))}
    courses,cines,offers,report=prepare(args.csv,known);out=pathlib.Path(args.out);out.mkdir(parents=True,exist_ok=True)
    (out/'import-report-2024.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    if report['conflicts'] or report['rejected']:raise SystemExit('Conflicts/rejections require review before import')
    for filename,rows in [('courses-2024.json',courses),('cine-2024.json',cines),('offers-2024.json',offers)]:
        (out/filename).write_text(json.dumps(rows,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k not in ('dictionary_codes','columns')},ensure_ascii=True))
