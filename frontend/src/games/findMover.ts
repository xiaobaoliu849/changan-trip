import { H, W, drawCover, drawSprite, floatText, hearts, hud, type GameFactory } from './engine'

interface Warrior {
  x: number
  y: number
  h: number
}

const ROUNDS = 3
const TIME = 40

export const findMover: GameFactory = ({ assets, finish }) => {
  const warriors: Warrior[] = []
  const rows = 5
  for (let r = 0; r < rows; r++) {
    const cols = 5
    const h = 70 + r * 12
    const y = 210 + r * 92
    for (let c = 0; c < cols; c++) {
      const spread = 0.78 + r * 0.05
      const x = W / 2 + (c - (cols - 1) / 2) * (W / cols) * spread
      warriors.push({ x, y, h })
    }
  }
  let target = Math.floor(Math.random() * warriors.length)
  let wiggleIn = 1.2
  let wiggle = 0
  let found = 0
  let wrong = 0
  let time = TIME
  let over = false
  let shown = 0
  const pops: { text: string; x: number; y: number; t: number; color: string }[] = []

  const end = (passed: boolean) => {
    over = true
    finish({
      passed,
      detail:
        `在兵马俑坑里找到${found}个偷偷动的战友，点错${wrong}次` +
        (passed ? `，用了${Math.round(TIME - time)}秒` : wrong >= 3 ? '，被讲解员请出去了' : '，时间到了'),
    })
  }

  return {
    update(dt) {
      if (over) return
      time -= dt
      for (const p of pops) {
        p.t -= dt
        p.y -= 30 * dt
      }
      if (wiggle > 0) wiggle -= dt
      else {
        wiggleIn -= dt
        if (wiggleIn <= 0) {
          // Later rounds wiggle more briefly.
          wiggle = 0.55 - found * 0.1
          wiggleIn = 1.8 + Math.random() * 1.2
          shown++
        }
      }
      if (time <= 0) end(false)
    },
    draw(ctx) {
      drawCover(ctx, assets.bg)
      ctx.fillStyle = 'rgba(40, 22, 10, 0.45)'
      ctx.fillRect(0, 0, W, H)
      warriors.forEach((w, i) => {
        ctx.save()
        let dx = 0
        let rot = 0
        if (i === target && wiggle > 0) {
          const t = performance.now() / 40
          dx = Math.sin(t) * 4
          rot = Math.sin(t * 1.3) * 0.12
        }
        ctx.translate(w.x + dx, w.y)
        ctx.rotate(rot)
        ctx.globalAlpha = 0.95
        drawSprite(ctx, assets.xiaoyong, 0, 0, w.h)
        ctx.restore()
      })
      drawSprite(ctx, assets.hero, 64, H - 8, 110)
      for (const p of pops) if (p.t > 0) floatText(ctx, p.text, p.x, p.y, p.color)
      hud(ctx, `⏱ ${Math.max(0, Math.ceil(time))}s  找到 ${found}/${ROUNDS}`, `${hearts(3 - wrong)}`)
      if (shown === 0) floatText(ctx, '盯紧了……', W / 2, 140, '#ffe9b0', 24)
    },
    pointer(x, y, down) {
      if (!down || over) return
      let best = -1
      let bestD = 1e9
      warriors.forEach((w, i) => {
        const cx = w.x
        const cy = w.y - w.h / 2
        const d = Math.hypot(x - cx, y - cy)
        if (d < bestD && d < w.h * 0.6) {
          bestD = d
          best = i
        }
      })
      if (best < 0) return
      if (best === target && shown > 0) {
        found++
        pops.push({ text: '抓到你了！', x, y: y - 20, t: 1, color: '#ffe066' })
        if (found >= ROUNDS) return end(true)
        let next = target
        while (next === target) next = Math.floor(Math.random() * warriors.length)
        target = next
        wiggle = 0
        wiggleIn = 1.2
      } else {
        wrong++
        pops.push({ text: '不是俺！', x, y: y - 20, t: 1, color: '#ff8a65' })
        if (wrong >= 3) end(false)
      }
    },
  }
}
