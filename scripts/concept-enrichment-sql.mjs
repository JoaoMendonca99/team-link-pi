// Emits a reviewable, atomic owner-only import. Does not connect to a database.
import fs from 'node:fs'
const quote=value=>"'"+value.replaceAll("'","''")+"'"
const concepts=JSON.parse(fs.readFileSync('data/concepts/enrichment-esco-v1.2.0.json','utf8'))
const relations=JSON.parse(fs.readFileSync('data/concepts/enrichment-relations-esco-v1.2.0.json','utf8'))
console.log('begin;')
for(let i=0;i<concepts.length;i+=50)console.log('select concept_private.import_enrichment('+quote(JSON.stringify(concepts.slice(i,i+50)))+'::jsonb);')
for(let i=0;i<relations.length;i+=100)console.log('select concept_private.import_source_relations('+quote(JSON.stringify(relations.slice(i,i+100)))+'::jsonb);')
console.log('commit;')
