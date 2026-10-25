import { useEffect, useRef } from 'react'
import type { StopResult } from '../api'
import { H, W, photoCrop, setPhotoMode, type Assets, type GameFactory } from './engine'

interface Props {
  factory: GameFactory
  assets: Assets
  options: Record<string, unknown>
  onDone: (r: StopResult) => void
}

export default function GameCanvas({ factory, assets, options, onDone }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')!
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = W * dpr
    canvas.height = H * dpr
    ctx.scale(dpr, dpr)

    let finished = false
    const game = factory({
      assets,
      options,
      finish: (r) => {
        if (finished) return
        finished = true
        // Keep a frame of the hero in action for the passport card, without the HUD and controls.
        // The next animation frame redraws them, so the player never sees the clean frame.
        let snapshot: string | undefined
        setPhotoMode(true)
        try {
          game.draw(ctx)
          // Framed on the hero and 小俑 — the whole 480×720 frame shrinks them to specks on the card.
          // At backing-store resolution: the crop is small, and the saved card renders it at 2x.
          const c = photoCrop(dpr)
          const shot = document.createElement('canvas')
          shot.width = Math.round(c.w * dpr)
          shot.height = Math.round(c.h * dpr)
          shot.getContext('2d')!.drawImage(canvas, c.x * dpr, c.y * dpr, c.w * dpr, c.h * dpr, 0, 0, shot.width, shot.height)
          snapshot = shot.toDataURL('image/jpeg', 0.85)
        } catch {
          snapshot = undefined
        } finally {
          setPhotoMode(false)
        }
        setTimeout(() => doneRef.current({ ...r, snapshot }), 900)
      },
    })

    let last = performance.now()
    let raf = 0
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000)
      last = t
      if (!finished) game.update(dt)
      game.draw(ctx)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    const toLocal = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H] as const
    }
    const down = (e: PointerEvent) => {
      e.preventDefault()
      canvas.setPointerCapture(e.pointerId)
      const [x, y] = toLocal(e)
      game.pointer?.(x, y, true)
    }
    const up = (e: PointerEvent) => {
      const [x, y] = toLocal(e)
      game.pointer?.(x, y, false)
    }
    const move = (e: PointerEvent) => {
      const [x, y] = toLocal(e)
      game.move?.(x, y)
    }
    const keyDown = (e: KeyboardEvent) => {
      if ([' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) e.preventDefault()
      if (!e.repeat) game.key?.(e.key, true)
    }
    const keyUp = (e: KeyboardEvent) => game.key?.(e.key, false)

    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', up)
    canvas.addEventListener('pointermove', move)
    window.addEventListener('keydown', keyDown)
    window.addEventListener('keyup', keyUp)
    return () => {
      cancelAnimationFrame(raf)
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', up)
      canvas.removeEventListener('pointermove', move)
      window.removeEventListener('keydown', keyDown)
      window.removeEventListener('keyup', keyUp)
    }
  }, [factory, assets, options])

  return <canvas ref={ref} className="game-canvas" />
}
