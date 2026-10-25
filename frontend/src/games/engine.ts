import type { StopResult } from '../api'

export const W = 480
export const H = 720

export interface Assets {
  bg: HTMLImageElement
  hero: HTMLImageElement
  xiaoyong: HTMLImageElement
}

export interface GameEnv {
  assets: Assets
  finish: (r: StopResult) => void
  /** Data from the run brief that the stop may react to. */
  options: Record<string, unknown>
}

export interface Game {
  update(dt: number): void
  draw(ctx: CanvasRenderingContext2D): void
  pointer?(x: number, y: number, down: boolean): void
  move?(x: number, y: number): void
  key?(key: string, down: boolean): void
}

export type GameFactory = (env: GameEnv) => Game

// Set only while GameCanvas draws the passport photo: games leave out HUDs, hints and controls.
export let photoMode = false
export const setPhotoMode = (on: boolean) => {
  photoMode = on
  if (on) actors = props = null
}

type Box = { x0: number; y0: number; x1: number; y1: number }
// Where the photo frame drew the hero and 小俑, and what they carry, in backing-store pixels.
let actors: Box | null = null
let props: Box | null = null

const grow = (b: Box | null, x: number, y: number): Box =>
  b ? { x0: Math.min(b.x0, x), y0: Math.min(b.y0, y), x1: Math.max(b.x1, x), y1: Math.max(b.y1, y) } : { x0: x, y0: y, x1: x, y1: y }

/**
 * Keep a box (in the current transform) inside the passport photo. Actors also set how close the shot is;
 * props (a bike, a lantern pole) only have to fit.
 */
export function photoKeep(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, actor = false) {
  if (!photoMode) return
  const m = ctx.getTransform()
  for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
    const p = m.transformPoint(new DOMPoint(x, y))
    if (actor) actors = grow(actors, p.x, p.y)
    props = grow(props, p.x, p.y)
  }
}

/** The 3:4 part of the frame (game units) the passport photo shows: the pair large, feet near the bottom. */
export function photoCrop(scale: number) {
  // Nobody drawn: the whole frame, as before.
  if (!actors || !props) return { x: 0, y: 0, w: W, h: H }
  const all = { x0: props.x0 / scale, y0: props.y0 / scale, x1: props.x1 / scale, y1: props.y1 / scale }
  const h = Math.min(
    Math.max(((actors.y1 - actors.y0) / scale) * 2.2, (all.y1 - all.y0) * 1.18, (all.x1 - all.x0) * 1.2 * (4 / 3), 320),
    H,
    (W * 4) / 3,
  )
  const w = (h * 3) / 4
  const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), max)
  return { x: clamp((all.x0 + all.x1) / 2 - w / 2, W - w), y: clamp(all.y1 - h * 0.92, H - h), w, h }
}

/** Draw ``img`` to cover the whole canvas, like CSS background-size: cover. */
export function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, offsetX = 0) {
  const s = Math.max(W / img.width, H / img.height)
  const w = img.width * s
  const h = img.height * s
  const x = (W - w) / 2 - offsetX
  ctx.drawImage(img, x, (H - h) / 2, w, h)
}

/** Draw a sprite standing on (x, y) with the given height. */
export function drawSprite(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, h: number, flip = false) {
  const w = (img.width / img.height) * h
  ctx.save()
  ctx.translate(x, y)
  if (flip) ctx.scale(-1, 1)
  ctx.drawImage(img, -w / 2, -h, w, h)
  ctx.restore()
}

/** ``drawSprite`` for the hero and our 小俑: the passport photo is framed around these. */
export function drawActor(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, h: number, flip = false) {
  drawSprite(ctx, img, x, y, h, flip)
  // An image that never loaded has no size to frame.
  if (!img.height) return
  const w = (img.width / img.height) * h
  photoKeep(ctx, x - w / 2, y - h, x + w / 2, y, true)
}

export function hud(ctx: CanvasRenderingContext2D, left: string, right: string) {
  if (photoMode) return
  ctx.save()
  ctx.fillStyle = 'rgba(30, 18, 10, 0.55)'
  roundRect(ctx, 12, 12, W - 24, 44, 14)
  ctx.fill()
  ctx.fillStyle = '#fff6e0'
  ctx.font = 'bold 20px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillText(left, 26, 34)
  ctx.textAlign = 'right'
  ctx.fillText(right, W - 26, 34)
  ctx.restore()
}

export function hearts(n: number, max = 3) {
  return '❤️'.repeat(Math.max(0, n)) + '🤍'.repeat(Math.max(0, max - n))
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export function floatText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color = '#fff', size = 26) {
  if (photoMode) return
  ctx.save()
  ctx.font = `bold ${size}px "PingFang SC", "Microsoft YaHei", sans-serif`
  ctx.textAlign = 'center'
  ctx.lineWidth = 5
  ctx.strokeStyle = 'rgba(40, 20, 10, 0.85)'
  ctx.strokeText(text, x, y)
  ctx.fillStyle = color
  ctx.fillText(text, x, y)
  ctx.restore()
}

export const rand = (a: number, b: number) => a + Math.random() * (b - a)
