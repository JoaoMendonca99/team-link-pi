import fs from 'node:fs'
const quote=value=>"'"+value.replaceAll("'","''")+"'"
const seed=JSON.parse(fs.readFileSync('data/concepts/seed.json','utf8'))
const relations=JSON.parse(fs.readFileSync('data/concepts/relations.json','utf8'))
console.log('begin;')
console.log('select concept_private.import_seed('+quote(JSON.stringify(seed))+'::jsonb);')
for(const row of relations)console.log('insert into public.conceitos_relacoes(origem_id,destino_id,fonte,validado) select least(a.id,b.id),greatest(a.id,b.id),'+quote(row.source)+',true from public.conceitos a,public.conceitos b where a.source_key='+quote(row.from)+' and b.source_key='+quote(row.to)+' on conflict do nothing;')
console.log('commit;')
