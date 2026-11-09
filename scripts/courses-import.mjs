// Public identification data only. Execute emitted SQL through the admin connector.
import { readFileSync } from 'node:fs'
const kind = process.argv[2], index = Number(process.argv[3]), batchSize = 1000
const files = { cine: 'cine', courses: 'courses', offers: 'offers' }
if (!Object.hasOwn(files, kind)) throw Error('Invalid import kind')
const rows = JSON.parse(readFileSync(new URL('../data/courses/' + files[kind] + '-2024.json', import.meta.url), 'utf8'))
if (!Number.isInteger(index) || index < 0 || index >= Math.ceil(rows.length / batchSize)) throw Error('Invalid batch index')
const json = JSON.stringify(rows.slice(index * batchSize, (index + 1) * batchSize)).replaceAll("'", "''")
process.stdout.write("select course_private.import_batch('" + kind + "','" + json + "'::jsonb) as processed;")
