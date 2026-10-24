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

export function hud(ctx: CanvasRenderingContext2D, left: string, right: string) {
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
