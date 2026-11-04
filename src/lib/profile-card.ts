import type { ProfileRow } from '@/types/database'
import type { ProjectDisplay } from '@/lib/projects/display'

function lines(ctx: CanvasRenderingContext2D, value: string, width: number, max: number) {
  const output: string[] = []
  let line = ''
  for (const char of value.trim().replace(/\s+/g, ' ').slice(0, 800)) {
    if (ctx.measureText(line + char).width > width) {
      const split = line.lastIndexOf(' ')
      output.push(split > 0 ? line.slice(0, split) : line)
      line = (split > 0 ? line.slice(split + 1) : '') + char
    } else line += char
    if (output.length === max) {
      output[max - 1] = output[max - 1].slice(0, -2).trimEnd() + '…'
      return output
    }
  }
  if (line.trim()) output.push(line.trim())
  return output
}

async function loadAvatar(url: string | null) {
  if (!url) return null
  try {
    const response = await fetch(url, { credentials: 'omit', signal: AbortSignal.timeout(4000) })
    if (!response.ok) return null
    return await createImageBitmap(await response.blob())
  } catch {
    return null
  }
}

export async function makeProfileCard(profile: ProfileRow, projects: ProjectDisplay[], url: string) {
  const [{ default: QRCode }, avatar] = await Promise.all([import('qrcode'), loadAvatar(profile.avatar_url)])
  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 1350
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('O navegador não conseguiu preparar a imagem.')
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

  function text(value: string, x: number, y: number, size: number, color: string, width: number, max = 1, bold = false) {
    ctx!.font = (bold ? '700 ' : '400 ') + size + 'px system-ui, sans-serif'
    ctx!.fillStyle = color
    const measured = lines(ctx!, value, width, max)
    measured.forEach((line, index) => ctx!.fillText(line, x, y + index * size * 1.22))
    return y + measured.length * size * 1.22
  }

  text('TEAM LINK', 72, 111, 32, '#83adff', 900, 1, true)
  text('PERFIL ACADÊMICO', 72, 155, 20, '#aebfdd', 900, 1, true)
  const name = profile.full_name?.trim() || 'Estudante Team Link'
  ctx.save()
  ctx.beginPath()
  ctx.arc(160, 294, 86, 0, 2 * Math.PI)
  ctx.clip()
  ctx.fillStyle = '#2454bb'
  ctx.fillRect(74, 208, 172, 172)
  if (avatar) {
    const edge = Math.min(avatar.width, avatar.height)
    ctx.drawImage(avatar, (avatar.width - edge) / 2, (avatar.height - edge) / 2, edge, edge, 74, 208, 172, 172)
    avatar.close()
  } else {
    ctx.textAlign = 'center'
    text(name.split(/\s+/).slice(0, 2).map((word) => Array.from(word)[0]).join('').toUpperCase(), 160, 315, 56, '#ffffff', 150, 1, true)
  }
  ctx.restore()
  let y = text(name, 275, 247, 49, '#ffffff', 723, 2, true)
  const academic = [profile.course, profile.university].filter(Boolean).join(' · ')
  if (academic) text(academic, 275, y, 27, '#c8d8f9', 723, 2)

  y = 433
  if (profile.bio) y = text(profile.bio, 72, y, 27, '#dae5fa', 924, 3) + 25
  for (const [label, items] of [['Habilidades', profile.skills], ['Interesses', profile.interests]] as const) {
    y = text(label, 72, y, 26, '#83adff', 920, 1, true)
    y = text(items?.slice(0, 6).join(' · ') || '—', 72, y + 5, 27, '#ffffff', 920, 2) + 21
  }

  ctx.strokeStyle = '#375897'
  ctx.beginPath()
  ctx.moveTo(72, 981)
  ctx.lineTo(1008, 981)
  ctx.stroke()
  y = text(projects.length + (projects.length === 1 ? ' projeto público' : ' projetos públicos'), 72, 1032, 30, '#ffffff', 630, 1, true)
  for (const project of projects.slice(0, 3)) y = text('• ' + project.title, 72, y + 7, 25, '#dae5fa', 620, 1)
  text(new URL(url).host, 72, 1270, 25, '#83adff', 620)

  const qr = document.createElement('canvas')
  await QRCode.toCanvas(qr, url, { width: 256, margin: 4, errorCorrectionLevel: 'M' })
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(qr, 740, 1010)
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => {
    if (blob) resolve(blob)
    else reject(new Error('Não foi possível exportar o cartão.'))
  }, 'image/png'))
}
