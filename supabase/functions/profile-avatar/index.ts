import { createClient } from 'npm:@supabase/supabase-js@2.105.4'
import jpeg from 'npm:jpeg-js@0.4.4'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
}
const maxSize = 2 * 1024 * 1024
const bucket = 'profile-avatars'

function reply(status: number, body: unknown) {
  return Response.json(body, { status, headers: cors })
}

async function readImage(request: Request) {
  const reader = request.body?.getReader()
  if (!reader) return null
  const parts: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > maxSize) { await reader.cancel(); return null }
    parts.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const part of parts) { bytes.set(part, offset); offset += part.length }
  if (bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255) return null
  try {
    const image = jpeg.decode(bytes, { useTArray: true, maxResolutionInMP: 1, maxMemoryUsageInMB: 16, tolerantDecoding: false })
    if (image.width !== 512 || image.height !== 512) return null
    return jpeg.encode(image, 87).data
  } catch {
    return null
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (request.method !== 'POST' && request.method !== 'DELETE') return reply(405, { error: 'Método inválido.' })
  const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1]
  if (!token) return reply(401, { error: 'Entre na sua conta.' })
  const url = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: { user }, error } = await admin.auth.getUser(token)
  if (error || !user) return reply(401, { error: 'Sessão inválida.' })

  const storage = admin.storage.from(bucket)
  let path: string | null = null
  let next: string | null = null
  if (request.method === 'POST') {
    const bytes = await readImage(request)
    if (!bytes) return reply(400, { error: 'Envie uma fotografia recortada em JPEG de até 2 MB.' })
    path = user.id + '/' + crypto.randomUUID() + '.jpg'
    const uploaded = await storage.upload(path, bytes, { contentType: 'image/jpeg', cacheControl: '300', upsert: false })
    if (uploaded.error) return reply(500, { error: 'Não foi possível gravar a fotografia.' })
    next = storage.getPublicUrl(path).data.publicUrl
  }

  const swapped = await admin.rpc('swap_profile_avatar', { p_user: user.id, p_avatar: next })
  if (swapped.error) {
    console.error('profile-avatar: swap_profile_avatar failed', {
      operation: request.method,
      code: swapped.error.code,
      status: swapped.status,
    })
    if (path) await storage.remove([path])
    return reply(500, { error: 'Não foi possível atualizar a fotografia no perfil.' })
  }
  const prefix = storage.getPublicUrl(user.id + '/').data.publicUrl
  const previous = typeof swapped.data === 'string' && swapped.data.startsWith(prefix)
    ? swapped.data.slice(prefix.length) : ''
  if (/^[\da-f-]{36}\.jpg$/i.test(previous)) await storage.remove([user.id + '/' + previous])
  return reply(200, { avatar_url: next })
})
