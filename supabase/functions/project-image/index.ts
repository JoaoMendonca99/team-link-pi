import { createClient } from 'npm:@supabase/supabase-js@2.105.4'
import { PNG } from 'npm:pngjs@7.0.0'
import { Buffer } from 'node:buffer'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
const noCache = { ...cors, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const asset = /^[a-f0-9-]{36}\.png$/
const maxBody = 2 * 1024 * 1024
const reply = (status: number, code: string) => Response.json({ code }, { status, headers: noCache })

async function readForm(request: Request) {
  const reader = request.body?.getReader()
  if (!reader) throw Error('missing body')
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > maxBody) {
      await reader.cancel()
      throw Error('body too large')
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  return new Response(bytes, { headers: { 'Content-Type': request.headers.get('Content-Type') ?? '' } }).formData()
}

function hasSinglePngHeader(bytes: Buffer) {
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset)
    const type = bytes.toString('ascii', offset + 4, offset + 8)
    const end = offset + 12 + length
    if (end > bytes.length || (type === 'IHDR' && (offset !== 8 || length !== 13))) return false
    if (type === 'IEND') return length === 0 && end === bytes.length
    offset = end
  }
  return false
}

async function verifiedPng(file: FormDataEntryValue | null) {
  if (!(file instanceof File) || file.type !== 'image/png' || file.size < 33 || file.size > maxBody) return null
  const bytes = Buffer.from(await file.arrayBuffer())
  if (bytes.toString('hex', 0, 8) !== '89504e470d0a1a0a' || bytes.toString('ascii', 12, 16) !== 'IHDR'
      || bytes.readUInt32BE(16) !== 512 || bytes.readUInt32BE(20) !== 512
      || bytes[24] !== 8 || ![2, 6].includes(bytes[25]) || bytes[26] || bytes[27] || bytes[28]
      || !hasSinglePngHeader(bytes)) return null
  try {
    // Decode the pixels and encode a fresh PNG with no original metadata.
    return PNG.sync.write(PNG.sync.read(bytes, { checkCRC: true }))
  } catch {
    return null
  }
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (!['GET', 'POST'].includes(request.method)) return reply(405, 'METHOD')
  const url = Deno.env.get('SUPABASE_URL')!
  const token = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1]
  const auth = { persistSession: false, autoRefreshToken: false }
  const viewer = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    auth, global: token ? { headers: { Authorization: 'Bearer ' + token } } : undefined,
  })
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth })
  const storage = admin.storage.from('project-images')

  if (request.method === 'GET') {
    const id = new URL(request.url).searchParams.get('id')
    if (!id || !uuid.test(id)) return reply(404, 'NOT_FOUND')
    const { data: path } = await viewer.rpc('get_project_image_ref', { p_project: id })
    if (typeof path !== 'string' || !asset.test(path)) return reply(404, 'NOT_FOUND')
    const result = await storage.download(path)
    return result.error || !result.data
      ? reply(404, 'NOT_FOUND')
      : new Response(result.data, { headers: { ...noCache, 'Content-Type': 'image/png' } })
  }

  if (!token) return reply(401, 'AUTH')
  const { data: { user }, error: sessionError } = await admin.auth.getUser(token)
  if (sessionError || !user) return reply(401, 'AUTH')

  let form: Record<string, unknown>, academic: unknown, tags: unknown, png: Buffer | null, expected: string | null
  try {
    const input = await readForm(request)
    const payload = JSON.parse(String(input.get('payload')))
    if (!payload.form || typeof payload.form !== 'object' || Array.isArray(payload.form) || !Array.isArray(payload.tags)) {
      return reply(400, '22023')
    }
    form = payload.form
    academic = payload.academic
    tags = payload.tags
    expected = payload.expected ?? null
    if (expected !== null && (typeof expected !== 'string' || !asset.test(expected))) return reply(400, 'IMAGE_INVALID')
    png = input.get('mode') === 'remove' ? null : await verifiedPng(input.get('image'))
    if (!png && input.get('mode') !== 'remove') return reply(400, 'IMAGE_INVALID')
  } catch {
    return reply(400, 'IMAGE_INVALID')
  }

  const project = form.p_project_id ?? null
  if (project !== null) {
    if (typeof project !== 'string' || !uuid.test(project)) return reply(400, '22023')
    const allowed = await viewer.rpc('is_project_join_manager', { p_project_id: project })
    if (allowed.error || allowed.data !== true) return reply(403, '42501')
  } else if (!png || expected !== null) {
    return reply(400, 'IMAGE_INVALID')
  }

  const path = png ? crypto.randomUUID() + '.png' : null
  const ticket = crypto.randomUUID()
  const uploadArgs = {
    p_ticket: ticket, p_user: user.id, p_project: project, p_path: path, p_expected_path: expected,
  }
  const registered = await admin.rpc('manage_project_image_upload', { ...uploadArgs, p_discard: false })
  if (registered.error) {
    console.error('project-image: register failed', { code: registered.error.code })
    return reply(500, 'IMAGE_SAVE')
  }

  const remove = async (key: string) => {
    try {
      const removed = await storage.remove([key])
      if (removed.error) console.warn('project-image: storage cleanup failed', { status: removed.error.statusCode })
    } catch {
      console.warn('project-image: storage cleanup unavailable')
    }
  }
  const discard = async () => {
    try {
      const result = await admin.rpc('manage_project_image_upload', { ...uploadArgs, p_discard: true })
      // A consumed ticket means the save committed. Never delete the new object in that case.
      if (path && result.data === true) await remove(path)
    } catch {
      console.warn('project-image: pending upload cleanup unavailable')
    }
  }
  try {
    if (path && png) {
      const uploaded = await storage.upload(path, png, { contentType: 'image/png', cacheControl: '0', upsert: false })
      if (uploaded.error) {
        await discard()
        return reply(500, 'IMAGE_SAVE')
      }
    }
    const saved = await viewer.rpc('save_project_concepts', {
      p_form: { ...form, p_image_ticket: ticket }, p_academic: academic ?? null, p_tag_choices: tags,
    })
    if (saved.error || typeof saved.data !== 'string') {
      const code = saved.error?.message === 'Quantidade abaixo das posições ocupadas'
        ? 'VACANCY_CAPACITY'
        : saved.error?.code ?? 'PROJECT_SAVE'
      console.error('project-image: project save failed', { code, status: saved.status })
      await discard()
      return reply(400, code)
    }
    if (expected) await remove(expected)
    return Response.json({ slug: saved.data }, { headers: noCache })
  } catch {
    await discard()
    return reply(500, 'PROJECT_SAVE')
  }
})
