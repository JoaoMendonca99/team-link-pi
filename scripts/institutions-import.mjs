// Emits bounded SQL for the administrative connector; no credentials in code or output.
import { readFileSync } from 'node:fs'
const rows = JSON.parse(readFileSync(new URL('../data/institutions/inep-ies-2024.json', import.meta.url), 'utf8'))
const batchSize = 64
const index = Number(process.argv[2])
if (!Number.isInteger(index) || index < 0 || index >= Math.ceil(rows.length / batchSize)) throw Error('Invalid batch index')
const json = JSON.stringify(rows.slice(index * batchSize, (index + 1) * batchSize)).replaceAll("'", "''")
process.stdout.write("select institution_private.import_batch('" + json + "'::jsonb) as processed;")
