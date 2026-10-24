let current: HTMLAudioElement | null = null
let endCurrent: (() => void) | null = null
let muted = false
// Bumped by stopVoice(); a line whose audio arrives after that (TTS takes ~3 s) is dropped
// instead of playing over the next screen.
let voiceEpoch = 0
export const voiceTicket = () => voiceEpoch

export function setMuted(m: boolean) {
  muted = m
  if (m) current?.pause()
  music.setMuted(m)
}

export function isMuted() {
  return muted
}

/** Play one voice line at a time; a new line cuts the previous one. */
export function playVoice(src: string): Promise<void> {
  current?.pause()
  endCurrent?.()
  if (muted) return Promise.resolve()
  const audio = new Audio(src)
  current = audio
  music.duck(true)
  return new Promise<void>((resolve) => {
    // pause() never fires "ended", so stopVoice() settles the promise itself.
    endCurrent = resolve
    audio.onended = () => resolve()
    audio.onerror = () => resolve()
    audio.play().catch(() => resolve())
  }).finally(() => {
    if (current === audio) {
      current = null
      endCurrent = null
      music.duck(false)
    }
  })
}

// ---------------------------------------------------------------------------
// Background music: pre-made Lyria tracks in public/assets/music/ (python -m backend.make_music).
// Bump MUSIC_VERSION after regenerating so browsers drop cached old tracks.
// ---------------------------------------------------------------------------

export type Track = 'town' | 'game' | 'finale'
const MUSIC_VERSION = 1
const VOLUME = 0.32
const DUCKED = 0.1 // while 小俑 is talking
const FADE = 0.9 // seconds, between tracks
const LOOP_FADE = 2.5 // seconds, crossfade at the loop point: the tracks end on a final chord

const music = (() => {
  let track: Track | null = null
  let playing: HTMLAudioElement | null = null
  let ducked = false
  let off = false
  let raf = 0
  const fades = new Map<HTMLAudioElement, { from: number; to: number; start: number; secs: number }>()

  const level = () => (off ? 0 : ducked ? DUCKED : VOLUME)

  const fade = (a: HTMLAudioElement, to: number, secs: number) => {
    fades.set(a, { from: a.volume, to, start: performance.now(), secs })
    if (!raf) raf = requestAnimationFrame(tick)
  }

  function tick(now: number) {
    for (const [a, f] of fades) {
      const k = Math.min(1, (now - f.start) / 1000 / f.secs)
      a.volume = Math.max(0, Math.min(1, f.from + (f.to - f.from) * k))
      if (k >= 1) {
        fades.delete(a)
        if (f.to === 0 && a !== playing) a.pause()
      }
    }
    // Start the next copy before the current one reaches its closing chord.
    if (playing && track && !off && playing.duration && playing.duration - playing.currentTime < LOOP_FADE) {
      const old = playing
      start(track, LOOP_FADE)
      fade(old, 0, LOOP_FADE)
    }
    raf = fades.size || playing ? requestAnimationFrame(tick) : 0
  }

  const start = (t: Track, secs: number) => {
    const a = new Audio(`/assets/music/bgm_${t}.mp3?v=${MUSIC_VERSION}`)
    a.volume = 0
    playing = a
    a.play().then(
      () => fade(a, level(), secs),
      () => {
        // Autoplay blocked until the player touches the page: retry on the first tap or key.
        if (playing !== a) return
        playing = null
        const retry = () => {
          removeEventListener('pointerdown', retry)
          removeEventListener('keydown', retry)
          if (track === t && !playing) start(t, secs)
        }
        addEventListener('pointerdown', retry)
        addEventListener('keydown', retry)
      },
    )
    if (!raf) raf = requestAnimationFrame(tick)
  }

  return {
    play(t: Track) {
      if (t === track && playing) return
      track = t
      const old = playing
      if (old) fade(old, 0, FADE)
      start(t, FADE)
    },
    duck(on: boolean) {
      ducked = on
      if (playing) fade(playing, level(), 0.35)
    },
    setMuted(m: boolean) {
      off = m
      if (playing) fade(playing, level(), 0.3)
    },
  }
})()

export const playMusic = (t: Track) => music.play(t)

/** Fallback voice when the TTS model is unavailable: the browser's built-in Chinese speech. */
export function speakBrowser(text: string): Promise<void> {
  if (muted || typeof speechSynthesis === 'undefined') return Promise.resolve()
  current?.pause()
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'zh-CN'
  u.rate = 0.85
  u.pitch = 0.7
  const zh = speechSynthesis.getVoices().find((v) => v.lang.startsWith('zh'))
  if (zh) u.voice = zh
  music.duck(true)
  return new Promise<void>((resolve) => {
    u.onend = () => resolve()
    u.onerror = () => resolve()
    speechSynthesis.speak(u)
  }).finally(() => music.duck(false))
}

export function stopVoice() {
  voiceEpoch++
  current?.pause()
  endCurrent?.()
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
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
