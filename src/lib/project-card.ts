import { projectInitials } from '@/components/team-link/project-logo'
import { PROJECT_STATUS_LABEL, type ProjectDisplay } from '@/lib/projects/display'
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client'

export const PUBLIC_PROJECT_ORIGIN = 'https://team-link-pi.vercel.app'

export interface ProjectCardOpportunities {
  openVacancies: number
  availablePositions: number
}

export interface ProjectCardOptions {
  token?: string | null
  hasLogo?: boolean
  opportunities?: ProjectCardOpportunities | null
  url?: string
}

export function isProjectPubliclyAccessible(project: Pick<ProjectDisplay, 'visibility' | 'status' | 'slug'>): boolean {
  return (
    project.visibility === 'public' &&
    project.status !== 'archived' &&
    Boolean(project.slug?.trim())
  )
}

export function getProjectPublicUrl(slug: string): string {
  const cleanSlug = encodeURIComponent(slug.trim())
  return `${PUBLIC_PROJECT_ORIGIN}/projetos/${cleanSlug}`
}

export function getProjectCardFilename(slug: string): string {
  const sanitized =
    slug
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'projeto'
  return `team-link-projeto-${sanitized}.png`
}

function cleanMarkdown(raw: string): string {
  return raw
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s+/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function pickPublicDescription(project: ProjectDisplay): string {
  const shortText = cleanMarkdown(project.shortDescription ?? '')
  const fullText = cleanMarkdown(project.description ?? '')
  if (shortText.length >= 40) return shortText
  if (fullText.length > shortText.length) return fullText
  return shortText || fullText || 'Acesse a página pública para conhecer os detalhes deste projeto acadêmico.'
}

function trimWithEllipsis(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  const clean = text.replace(/[,.;:\-–—\s]+$/u, '').trim()
  if (!clean) return '…'
  if (ctx.measureText(clean + '…').width <= maxWidth) return clean + '…'

  const words = clean.split(' ')
  while (words.length > 1) {
    words.pop()
    const candidate = words.join(' ').replace(/[,.;:\-–—\s]+$/u, '').trim()
    if (candidate && ctx.measureText(candidate + '…').width <= maxWidth) {
      return candidate + '…'
    }
  }

  let chars = words[0] ?? clean
  while (chars.length > 1 && ctx.measureText(chars + '…').width > maxWidth) {
    chars = chars.slice(0, -1)
  }
  return chars.trimEnd() + '…'
}

function wrapWords(
  ctx: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const normalized = value.trim().replace(/\s+/g, ' ').slice(0, 900)
  if (!normalized || maxLines <= 0) return []

  const rawWords = normalized.split(' ')
  const words: string[] = []
  for (const word of rawWords) {
    if (ctx.measureText(word).width <= maxWidth) {
      words.push(word)
    } else {
      let chunk = ''
      for (const char of Array.from(word)) {
        if (chunk && ctx.measureText(chunk + char).width > maxWidth) {
          words.push(chunk)
          chunk = char
        } else {
          chunk += char
        }
      }
      if (chunk) words.push(chunk)
    }
  }

  const output: string[] = []
  let current = ''

  for (let i = 0; i < words.length; i++) {
    const word = words[i]
    const next = current ? `${current} ${word}` : word
    if (ctx.measureText(next).width <= maxWidth) {
      current = next
    } else {
      if (output.length === maxLines - 1) {
        output.push(trimWithEllipsis(ctx, current || word, maxWidth))
        return output
      }
      if (current) {
        output.push(current)
        current = word
      } else {
        output.push(trimWithEllipsis(ctx, word, maxWidth))
        current = ''
      }
    }
  }

  if (current) {
    output.push(current)
  }
  return output
}

async function loadProjectLogo(projectId: string, token?: string | null): Promise<ImageBitmap | null> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  const apikey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!projectId || !base || !apikey) return null
  try {
    const endpoint = new URL('/functions/v1/project-image', base)
    endpoint.searchParams.set('id', projectId)
    const headers: Record<string, string> = { apikey }
    if (token) headers.Authorization = 'Bearer ' + token
    const response = await fetch(endpoint, {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok || !response.headers.get('Content-Type')?.startsWith('image/png')) {
      return null
    }
    return await createImageBitmap(await response.blob())
  } catch {
    return null
  }
}

export async function loadPublicProjectOpportunities(
  project: Pick<ProjectDisplay, 'id' | 'status' | 'visibility'>,
): Promise<ProjectCardOpportunities | null> {
  if (
    project.visibility !== 'public' ||
    (project.status !== 'open' && project.status !== 'in_progress') ||
    !isSupabaseConfigured()
  ) {
    return null
  }
  try {
    const { data, error } = await getSupabaseClient().rpc('recruitment_vacancies', {
      p_project: project.id,
    })
    if (error || !Array.isArray(data)) return null
    const eligible = data.filter(
      (item): item is { open: boolean; available: number } =>
        Boolean(item && typeof item === 'object' && item.open === true && Number(item.available) > 0),
    )
    const availablePositions = eligible.reduce((sum, item) => sum + Number(item.available), 0)
    if (eligible.length <= 0 || availablePositions <= 0) return null
    return {
      openVacancies: eligible.length,
      availablePositions,
    }
  } catch {
    return null
  }
}

export async function makeProjectCard(
  project: ProjectDisplay,
  options: ProjectCardOptions = {},
): Promise<Blob> {
  if (!isProjectPubliclyAccessible(project)) {
    throw new Error('A página pública deste projeto não está acessível para divulgação.')
  }

  const publicUrl = options.url ?? getProjectPublicUrl(project.slug)
  const shouldFetchLogo = options.hasLogo !== false

  const [{ default: QRCode }, logo, opportunities] = await Promise.all([
    import('qrcode'),
    shouldFetchLogo ? loadProjectLogo(project.id, options.token) : Promise.resolve(null),
    options.opportunities !== undefined
      ? Promise.resolve(options.opportunities)
      : loadPublicProjectOpportunities(project),
  ])

  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 1350
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('O navegador não conseguiu preparar a imagem.')

  // Fundo azul-marinho no mesmo padrão do cartão acadêmico
  const gradient = ctx.createLinearGradient(0, 0, 1080, 1350)
  gradient.addColorStop(0, '#142b63')
  gradient.addColorStop(1, '#070e21')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 1080, 1350)

  ctx.strokeStyle = '#375897'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.roundRect(28, 28, 1024, 1294, 38)
  ctx.stroke()

  function drawText(
    value: string,
    x: number,
    y: number,
    size: number,
    color: string,
    maxWidth: number,
    maxLines = 1,
    bold = false,
    lineHeightMultiplier = 1.24,
  ) {
    ctx!.font = `${bold ? '700' : '400'} ${size}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
    ctx!.fillStyle = color
    const measured = wrapWords(ctx!, value, maxWidth, maxLines)
    measured.forEach((line, index) => {
      ctx!.fillText(line, x, y + index * size * lineHeightMultiplier)
    })
    return y + measured.length * size * lineHeightMultiplier
  }

  // 1. Cabeçalho
  drawText('TEAM LINK', 72, 111, 32, '#83adff', 900, 1, true)
  drawText('PROJETO ACADÊMICO', 72, 155, 20, '#aebfdd', 900, 1, true)

  // 2. Identidade do projeto (Logo real ou fallback com iniciais + Título + Categoria + Status)
  const title = project.title?.trim() || 'Projeto Acadêmico'
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(72, 204, 172, 172, 32)
  ctx.clip()
  if (logo) {
    ctx.fillStyle = '#0f204b'
    ctx.fillRect(72, 204, 172, 172)
    const scale = Math.min(172 / logo.width, 172 / logo.height)
    const drawW = logo.width * scale
    const drawH = logo.height * scale
    const drawX = 72 + (172 - drawW) / 2
    const drawY = 204 + (172 - drawH) / 2
    ctx.drawImage(logo, drawX, drawY, drawW, drawH)
    logo.close()
  } else {
    ctx.fillStyle = '#2454bb'
    ctx.fillRect(72, 204, 172, 172)
    ctx.textAlign = 'center'
    drawText(projectInitials(title), 158, 310, 56, '#ffffff', 150, 1, true)
  }
  ctx.restore()

  ctx.strokeStyle = '#375897'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.roundRect(72, 204, 172, 172, 32)
  ctx.stroke()

  const titleFontSize = title.length > 40 ? 38 : 46
  let headerY = drawText(title, 274, 246, titleFontSize, '#ffffff', 734, 2, true, 1.18)
  const categoryLabel = project.category?.trim() || 'Projeto universitário'
  headerY = drawText(categoryLabel, 274, headerY + 8, 27, '#c8d8f9', 734, 1, false)
  const statusLabel = PROJECT_STATUS_LABEL[project.status] ?? 'Em andamento'
  headerY = drawText(`Status: ${statusLabel}`, 274, headerY + 6, 24, '#83adff', 734, 1, true)

  // 3. Descrição pública
  let y = Math.max(442, headerY + 34)
  y = drawText('Descrição', 72, y, 26, '#83adff', 936, 1, true)
  const description = pickPublicDescription(project)
  y = drawText(description, 72, y + 8, 27, '#dae5fa', 936, 4, false, 1.3) + 28

  // 4. Tags (até 4 tags relevantes)
  const tags = (project.tags ?? [])
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 4)

  if (tags.length > 0) {
    y = drawText('Tags', 72, y, 26, '#83adff', 936, 1, true)
    const pillStartY = y + 6
    let pillX = 72
    let pillY = pillStartY
    const pillHeight = 46
    const pillGapX = 14
    const pillGapY = 14
    const maxRight = 1008

    ctx.font = '600 23px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    for (const rawTag of tags) {
      const tagText =
        ctx.measureText(rawTag).width <= 420 ? rawTag : trimWithEllipsis(ctx, rawTag, 420)
      const textWidth = ctx.measureText(tagText).width
      const pillWidth = Math.min(Math.ceil(textWidth + 36), maxRight - 72)

      if (pillX > 72 && pillX + pillWidth > maxRight) {
        pillX = 72
        pillY += pillHeight + pillGapY
      }

      ctx.fillStyle = '#132a60'
      ctx.strokeStyle = '#3b63ac'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.roundRect(pillX, pillY, pillWidth, pillHeight, 23)
      ctx.fill()
      ctx.stroke()

      ctx.fillStyle = '#ffffff'
      ctx.fillText(tagText, pillX + 18, pillY + 31)
      pillX += pillWidth + pillGapX
    }

    y = pillY + pillHeight + 34
  }

  // 5. Oportunidades (somente se houver vagas abertas com posições disponíveis reais)
  if (opportunities && opportunities.availablePositions > 0) {
    const boxY = Math.min(y, 855)
    ctx.fillStyle = '#102554'
    ctx.strokeStyle = '#375897'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.roundRect(72, boxY, 936, 94, 22)
    ctx.fill()
    ctx.stroke()

    drawText('Vagas abertas para novos integrantes', 98, boxY + 38, 25, '#83adff', 884, 1, true)
    const vacanciesText =
      opportunities.openVacancies === 1
        ? '1 vaga aberta'
        : `${opportunities.openVacancies} vagas abertas`
    const positionsText =
      opportunities.availablePositions === 1
        ? '1 posição disponível'
        : `${opportunities.availablePositions} posições disponíveis`
    drawText(`${vacanciesText} · ${positionsText}`, 98, boxY + 72, 23, '#dae5fa', 884, 1, false)
  }

  // 6. Divisor inferior, chamada para página pública, QR Code e rodapé
  ctx.strokeStyle = '#375897'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(72, 976)
  ctx.lineTo(1008, 976)
  ctx.stroke()

  const footerY = drawText('Conheça este projeto', 72, 1042, 34, '#ffffff', 630, 1, true)
  drawText(
    'Escaneie o QR Code para acessar a página pública.',
    72,
    footerY + 10,
    26,
    '#dae5fa',
    620,
    2,
    false,
    1.28,
  )
  drawText(new URL(publicUrl).host, 72, 1268, 25, '#83adff', 620, 1, true)

  const qr = document.createElement('canvas')
  await QRCode.toCanvas(qr, publicUrl, {
    width: 260,
    margin: 4,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  })
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(qr, 740, 1006)

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Não foi possível exportar o cartão.'))
    }, 'image/png'),
  )
}
