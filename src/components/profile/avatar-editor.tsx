'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { UserAvatar } from '@/components/team-link/user-avatar'

export type AvatarCrop = { image: ImageBitmap; zoom: number; x: number; y: number }

function drawCrop(canvas: HTMLCanvasElement, { image, zoom, x, y }: AvatarCrop) {
  canvas.width = canvas.height = 512
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Não foi possível preparar a fotografia.')
  const side = Math.min(image.width, image.height) / zoom
  const left = (image.width - side) * x / 100
  const top = (image.height - side) * y / 100
  context.fillStyle = '#081021'
  context.fillRect(0, 0, 512, 512)
  context.drawImage(image, left, top, side, side, 0, 0, 512, 512)
}

export async function exportAvatar(crop: AvatarCrop) {
  const canvas = document.createElement('canvas')
  drawCrop(canvas, crop)
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => {
    if (blob && blob.size <= 2 * 1024 * 1024) resolve(blob)
    else reject(new Error('Não foi possível gerar uma fotografia de até 2 MB.'))
  }, 'image/jpeg', 0.88))
}

async function decodeAvatar(file: File) {
  if (file.size > 12 * 1024 * 1024) throw new Error('Escolha uma fotografia de até 12 MB antes do recorte.')
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
  const webp = String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  if (!jpeg && !png && !webp) throw new Error('Escolha uma imagem JPEG, PNG ou WebP válida.')
  const image = await createImageBitmap(file)
  if (image.width * image.height > 40_000_000) {
    image.close()
    throw new Error('As dimensões da fotografia são muito grandes.')
  }
  return image
}

export function AvatarEditor({ name, avatarUrl, draft, onChange, disabled }: {
  name: string
  avatarUrl: string | null
  draft: AvatarCrop | null | undefined
  onChange: (draft: AvatarCrop | null | undefined) => void
  disabled?: boolean
}) {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const image = draft?.image
  useEffect(() => () => image?.close(), [image])
  useEffect(() => { if (canvas.current && draft) drawCrop(canvas.current, draft) }, [draft])

  async function choose(file?: File) {
    if (!file) return
    setError('')
    setLoading(true)
    try {
      onChange({ image: await decodeAvatar(file), zoom: 1, x: 50, y: 50 })
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Não foi possível abrir esta imagem.')
    } finally {
      setLoading(false)
    }
  }

  return <div className="min-w-0 space-y-3">
    <Label htmlFor="profile-photo">Fotografia de perfil</Label>
    <div className="flex flex-wrap items-start gap-4">
      {draft ? <canvas ref={canvas} aria-label="Prévia quadrada da fotografia" className="size-32 rounded-2xl border border-border" /> :
        <UserAvatar name={name} imageUrl={draft === null ? undefined : avatarUrl ?? undefined} sizeClassName="size-24" />}
      <div className="min-w-0 flex-1 basis-48 space-y-2">
        <Input id="profile-photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled || loading}
          onChange={(event) => { void choose(event.target.files?.[0]); event.target.value = '' }} />
        <p className="flex items-center gap-1 text-xs text-muted-foreground"><Camera className="size-4" aria-hidden /> JPEG, PNG ou WebP.</p>
        <div className="flex flex-wrap gap-2">
          {(draft || (avatarUrl && draft !== null)) && <Button type="button" size="sm" variant="outline" disabled={disabled || loading}
            onClick={() => onChange(null)}><Trash2 aria-hidden /> Remover foto</Button>}
          {draft !== undefined && <Button type="button" size="sm" variant="ghost" disabled={disabled || loading}
            onClick={() => onChange(undefined)}>Desfazer alteração</Button>}
        </div>
      </div>
    </div>
    {loading && <p role="status">Carregando fotografia…</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {draft && <div className="grid gap-3 sm:grid-cols-3">
      {([['zoom', 'Zoom', 1, 3, 0.05], ['x', 'Enquadramento horizontal', 0, 100, 1], ['y', 'Enquadramento vertical', 0, 100, 1]] as const)
        .map(([key, label, min, max, step]) => <label key={key} className="block text-xs text-muted-foreground">
          {label}
          <input type="range" className="block w-full accent-primary" min={min} max={max} step={step}
            value={draft[key]} disabled={disabled} onChange={(event) => onChange({ ...draft, [key]: Number(event.target.value) })} />
        </label>)}
    </div>}
  </div>
}
