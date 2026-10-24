import { H, W, drawCover, drawSprite, floatText, hearts, hud, type GameFactory } from './engine'

const BELL_X = 150
const BELL_Y = H / 2 + 40
const SPEED = 260
const WINDOW = 42
const PATTERN = [0.9, 0.9, 0.45, 0.45, 0.9, 0.9, 0.6, 0.6, 0.6, 0.9, 0.45, 0.45, 0.45, 0.9, 0.6, 0.6, 0.9, 0.9]

export const bellRhythm: GameFactory = ({ assets, finish }) => {
  const notes: { x: number; hit: boolean; gone: boolean }[] = []
  let at = 1.2
  for (const gap of PATTERN) {
    notes.push({ x: BELL_X + at * SPEED, hit: false, gone: false })
    at += gap
  }
  let hits = 0
  let strikes = 0
  let ring = 0
  let over = false
  const pops: { text: string; t: number; color: string }[] = []

  const end = (passed: boolean) => {
    over = true
    finish({
      passed,
      detail: `钟楼敲钟${hits}/${notes.length}下，敲错或漏敲${strikes}次${passed ? '' : '，把全城都吵醒了'}`,
    })
  }

  const strike = (why: string) => {
    strikes++
    pops.push({ text: why, t: 0.8, color: '#ff8a65' })
    if (strikes >= 3) end(false)
  }

  const tap = () => {
    if (over) return
    const n = notes.find((n) => !n.hit && !n.gone && Math.abs(n.x - BELL_X) < WINDOW)
    if (n) {
      n.hit = true
      hits++
      ring = 0.3
      pops.push({ text: Math.abs(n.x - BELL_X) < 16 ? '咚！完美' : '咚！', t: 0.6, color: '#ffe066' })
    } else strike('敲早了！')
  }

  return {
    update(dt) {
      if (over) return
      ring = Math.max(0, ring - dt)
      for (const p of pops) p.t -= dt
      for (const n of notes) {
        n.x -= SPEED * dt
        if (!n.hit && !n.gone && n.x < BELL_X - WINDOW) {
          n.gone = true
          strike('漏了一下！')
          if (over) return
        }
      }
      if (notes.every((n) => n.hit || n.gone) && notes[notes.length - 1].x < BELL_X - 80) end(true)
    },
    draw(ctx) {
      drawCover(ctx, assets.bg)
      ctx.fillStyle = 'rgba(20, 20, 40, 0.35)'
      ctx.fillRect(0, 0, W, H)
      // Track
      ctx.fillStyle = 'rgba(255, 246, 224, 0.25)'
      ctx.fillRect(0, BELL_Y - 34, W, 68)
      // Bell target
      ctx.save()
      ctx.translate(BELL_X, BELL_Y)
      ctx.scale(1 + ring, 1 + ring)
      ctx.beginPath()
      ctx.arc(0, 0, WINDOW, 0, Math.PI * 2)
      ctx.fillStyle = ring > 0 ? 'rgba(255, 210, 90, 0.9)' : 'rgba(255, 210, 90, 0.35)'
      ctx.fill()
      ctx.lineWidth = 4
      ctx.strokeStyle = '#ffcf5c'
      ctx.stroke()
      ctx.font = '46px serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('🔔', 0, 2)
      ctx.restore()
      for (const n of notes) {
        if (n.hit || n.gone || n.x > W + 40) continue
        ctx.beginPath()
        ctx.arc(n.x, BELL_Y, 22, 0, Math.PI * 2)
        ctx.fillStyle = '#c0392b'
        ctx.fill()
        ctx.strokeStyle = '#fff6e0'
        ctx.lineWidth = 3
        ctx.stroke()
      }
      drawSprite(ctx, assets.hero, BELL_X - 30, H - 30, 150)
      drawSprite(ctx, assets.xiaoyong, W - 80, H - 30, 120)
      pops.filter((p) => p.t > 0).forEach((p, i) => floatText(ctx, p.text, BELL_X + 40, BELL_Y - 70 - i * 30, p.color))
      hud(ctx, `敲中 ${hits}/${notes.length}`, `吵醒市民 ${hearts(3 - strikes)}`)
    },
    pointer(_x, _y, down) {
      if (down) tap()
    },
    key(k, down) {
      if (down && (k === ' ' || k === 'Enter')) tap()
    },
  }
}
