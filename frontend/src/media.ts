let current: HTMLAudioElement | null = null
let muted = false

export function setMuted(m: boolean) {
  muted = m
  if (m) current?.pause()
}

export function isMuted() {
  return muted
}

/** Play one voice line at a time; a new line cuts the previous one. */
export function playVoice(src: string): Promise<void> {
  current?.pause()
  if (muted) return Promise.resolve()
  const audio = new Audio(src)
  current = audio
  return new Promise((resolve) => {
    audio.onended = () => resolve()
    audio.onerror = () => resolve()
    audio.play().catch(() => resolve())
  })
}

export function stopVoice() {
  current?.pause()
}

const cache = new Map<string, HTMLImageElement>()

export function loadImage(src: string): Promise<HTMLImageElement> {
  const hit = cache.get(src)
  if (hit?.complete) return Promise.resolve(hit)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      cache.set(src, img)
      resolve(img)
    }
    img.onerror = reject
    img.src = src
  })
}

/** Make the white background around a generated sprite transparent (flood fill from the edges). */
export async function cutOutWhite(src: string): Promise<string> {
  const img = await loadImage(src)
  const max = 512
  const scale = Math.min(1, max / Math.max(img.width, img.height))
  const w = Math.round(img.width * scale)
  const h = Math.round(img.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, w, h)
  const data = ctx.getImageData(0, 0, w, h)
  const px = data.data
  const seen = new Uint8Array(w * h)
  const stack: number[] = []
  const isBg = (i: number) => px[i * 4] > 225 && px[i * 4 + 1] > 225 && px[i * 4 + 2] > 225
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x)
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1)
  while (stack.length) {
    const i = stack.pop()!
    if (seen[i] || !isBg(i)) continue
    seen[i] = 1
    px[i * 4 + 3] = 0
    const x = i % w
    if (x > 0) stack.push(i - 1)
    if (x < w - 1) stack.push(i + 1)
    if (i >= w) stack.push(i - w)
    if (i < w * (h - 1)) stack.push(i + w)
  }
  ctx.putImageData(data, 0, 0)
  // Trim to the visible bounds so sprites sit on the ground line.
  let minX = w, minY = h, maxX = 0, maxY = 0
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (px[(y * w + x) * 4 + 3] > 20) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
  if (maxX <= minX || maxY <= minY) return canvas.toDataURL('image/png')
  const out = document.createElement('canvas')
  out.width = maxX - minX + 1
  out.height = maxY - minY + 1
  out.getContext('2d')!.drawImage(canvas, minX, minY, out.width, out.height, 0, 0, out.width, out.height)
  return out.toDataURL('image/png')
}

export function fileToBase64(file: File): Promise<{ b64: string; mime: string; url: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result)
      resolve({ url, mime: file.type || 'image/jpeg', b64: url.split(',')[1] })
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
