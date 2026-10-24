import { H, W, drawCover, drawSprite, floatText, hearts, hud, rand, type GameFactory } from './engine'

const TIME = 30
const LIMIT = 0.85
const STACK = 4

export const lanternBalance: GameFactory = ({ assets, finish }) => {
  let t = 0
  let angle = rand(-0.05, 0.05)
  let vel = 0
  let gust = 0
  let gustIn = 2
  let left = false
  let right = false
  let drops = 0
  let fallen = 0
  let over = false

  const end = (passed: boolean) => {
    over = true
    const pct = Math.round(Math.min(1, t / TIME) * 100)
    finish({
      passed,
      detail: `顶着一串灯笼走大唐不夜城，走了${pct}%，灯笼掉了${drops}次${passed ? '，稳稳走完了' : '，灯笼全碎了'}`,
    })
  }

  return {
    update(dt) {
      if (over) return
      t += dt
      if (fallen > 0) {
        fallen -= dt
        if (fallen <= 0) {
          angle = 0
          vel = 0
        }
        return
      }
      gustIn -= dt
      if (gustIn <= 0) {
        gust = rand(-1, 1) * (0.9 + t * 0.04)
        gustIn = rand(1.2, 2.4)
      }
      gust *= 1 - dt * 0.8
      const input = (right ? 1 : 0) - (left ? 1 : 0)
      vel += (Math.sin(angle) * 3.2 + gust - input * 4.2) * dt
      vel *= 1 - dt * 1.4
      angle += vel * dt
      if (Math.abs(angle) > LIMIT) {
        drops++
        fallen = 1
        if (drops >= 3) return end(false)
      }
      if (t >= TIME) end(true)
    },
    draw(ctx) {
      drawCover(ctx, assets.bg, (t / TIME) * 60)
      const hx = W / 2
      const hy = H - 50
      drawSprite(ctx, assets.hero, hx, hy, 170)
      // Lantern pole on the hero's head
      const top = hy - 165
      ctx.save()
      ctx.translate(hx, top)
      ctx.rotate(fallen > 0 ? Math.sign(angle) * 1.4 : angle)
      ctx.strokeStyle = '#3b2412'
      ctx.lineWidth = 6
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(0, -STACK * 62 - 10)
      ctx.stroke()
      ctx.font = '50px serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      for (let i = 0; i < STACK; i++) {
        ctx.fillText('🏮', 0, -40 - i * 62)
        // Read top to bottom the lanterns spell 1024.
        ctx.save()
        ctx.font = 'bold 20px "PingFang SC", sans-serif'
        ctx.fillStyle = '#ffe066'
        ctx.fillText('1024'[STACK - 1 - i], 0, -38 - i * 62)
        ctx.restore()
        ctx.font = '50px serif'
      }
      ctx.restore()
      // Tilt meter
      ctx.fillStyle = 'rgba(255,255,255,0.35)'
      ctx.fillRect(60, 80, W - 120, 10)
      ctx.fillStyle = Math.abs(angle) > LIMIT * 0.7 ? '#ff5a36' : '#ffcf5c'
      ctx.fillRect(W / 2 + (angle / LIMIT) * ((W - 120) / 2) - 6, 74, 12, 22)
      if (fallen > 0) floatText(ctx, '哎呀，掉了！', W / 2, 200, '#ff8a65', 30)
      if (t < 3) floatText(ctx, '灯笼往哪边倒，就按哪边', W / 2, H / 2, '#ffe9b0', 22)
      hud(ctx, `🏮 ${Math.round(Math.min(1, t / TIME) * 100)}%`, hearts(3 - drops))
    },
    pointer(x, _y, down) {
      if (!down) {
        left = false
        right = false
        return
      }
      if (x < W / 2) left = true
      else right = true
    },
    key(k, down) {
      if (k === 'ArrowLeft' || k === 'a') left = down
      if (k === 'ArrowRight' || k === 'd') right = down
    },
  }
}
