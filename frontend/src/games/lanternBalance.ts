import { H, W, drawActor, drawCover, floatText, hearts, hud, photoKeep, photoMode, rand, roundRect, type GameFactory } from './engine'

const TIME = 30
const LIMIT = 1.0
const STACK = 4
// Tuned by simulation: ignoring the lanterns drops them in ~5 s, while a player who reacts
// within ~0.7 s and holds the key while tilted finishes. The old values (3.2/4.2/1.4) failed
// even a perfect 0.25 s bot every time: holding the key over-corrected into the other side.
const GRAVITY = 2.2
const PUSH = 2.8
const DAMPING = 2.8
const CALM = 3 // seconds of no wind at the start to try the controls
const SHOW_ARROW = 0.15

export const lanternBalance: GameFactory = ({ assets, finish }) => {
  let t = 0
  let angle = rand(-0.05, 0.05)
  let vel = 0
  let gust = 0
  let gustIn = CALM
  let left = false
  let right = false
  let drops = 0
  let fallen = 0
  let over = false
  let step = 0 // eased hero offset toward the pressed side
  let xy = W / 2 - 105 // 小俑 walks alongside, a beat behind the hero

  const end = (passed: boolean) => {
    over = true
    const pct = Math.round(Math.min(1, t / TIME) * 100)
    finish({
      passed,
      detail: `顶着一串灯笼走大唐不夜城，走了${pct}%，灯笼掉了${drops}次${passed ? '，稳稳走完了' : '，灯笼全碎了'}`,
    })
  }

  const button = (ctx: CanvasRenderingContext2D, x: number, label: string, on: boolean) => {
    if (photoMode) return
    ctx.save()
    ctx.fillStyle = on ? 'rgba(255, 207, 92, 0.9)' : 'rgba(30, 18, 10, 0.45)'
    roundRect(ctx, x, H - 96, 96, 72, 18)
    ctx.fill()
    ctx.fillStyle = on ? '#3b2412' : '#fff6e0'
    ctx.font = 'bold 34px "PingFang SC", "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, x + 48, H - 60)
    ctx.restore()
  }

  return {
    update(dt) {
      if (over) return
      t += dt
      const input = (right ? 1 : 0) - (left ? 1 : 0)
      step += (input - step) * Math.min(1, dt * 8)
      xy += (W / 2 + step * 34 - 105 - xy) * Math.min(1, dt * 4)
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
        gust = rand(-1, 1) * (0.6 + t * 0.03)
        gustIn = rand(1.2, 2.4)
      }
      gust *= 1 - dt * 0.8
      vel += (Math.sin(angle) * GRAVITY + gust - input * PUSH) * dt
      vel *= 1 - dt * DAMPING
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
      // The hero steps toward the pressed side, so the controls visibly do something.
      const hx = W / 2 + step * 34
      const hy = H - 120
      drawActor(ctx, assets.xiaoyong, xy, hy, 84)
      // 小俑 calls out the steps now and then.
      if (t > CALM && fallen <= 0 && t % 4 < 0.9) floatText(ctx, '嘿——哟！', xy, hy - 96, '#ffe9b0', 18)
      drawActor(ctx, assets.hero, hx, hy, 160)
      // Lantern pole on the hero's head
      const top = hy - 155
      ctx.save()
      ctx.translate(hx, top)
      ctx.rotate(fallen > 0 ? Math.sign(angle) * 1.4 : angle)
      ctx.strokeStyle = '#3b2412'
      ctx.lineWidth = 6
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(0, -STACK * 52 - 10)
      ctx.stroke()
      // The 1024 stack is the point of the passport photo here.
      photoKeep(ctx, -24, -STACK * 52 - 24, 24, 0)
      ctx.font = '44px serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      for (let i = 0; i < STACK; i++) {
        ctx.fillText('🏮', 0, -36 - i * 52)
        // Read top to bottom the lanterns spell 1024.
        ctx.save()
        ctx.font = 'bold 18px "PingFang SC", sans-serif'
        ctx.fillStyle = '#ffe066'
        ctx.fillText('1024'[STACK - 1 - i], 0, -34 - i * 52)
        ctx.restore()
        ctx.font = '44px serif'
      }
      ctx.restore()
      if (!photoMode) {
        // Tilt meter: the marker must stay out of the red ends.
        const mw = W - 120
        ctx.fillStyle = 'rgba(30, 18, 10, 0.45)'
        ctx.fillRect(60, 80, mw, 12)
        ctx.fillStyle = 'rgba(255, 90, 54, 0.8)'
        ctx.fillRect(60, 80, mw * 0.15, 12)
        ctx.fillRect(60 + mw * 0.85, 80, mw * 0.15, 12)
        ctx.fillStyle = Math.abs(angle) > LIMIT * 0.7 ? '#ff5a36' : '#ffcf5c'
        ctx.fillRect(W / 2 + (angle / LIMIT) * (mw / 2) - 6, 74, 12, 24)
      }
      // Which way to press, right where the player is looking.
      if (fallen <= 0 && Math.abs(angle) > SHOW_ARROW) {
        const urgent = Math.abs(angle) > LIMIT * 0.6
        floatText(ctx, angle > 0 ? '按住右 ▶' : '◀ 按住左', W / 2, 140, urgent ? '#ff8a65' : '#ffe9b0', urgent ? 34 : 28)
      }
      if (fallen > 0) floatText(ctx, '哎呀，掉了！', W / 2, 200, '#ff8a65', 30)
      if (t < CALM) {
        floatText(ctx, '热身：灯笼往哪边歪', W / 2, 180, '#ffe9b0', 22)
        floatText(ctx, '就按住哪边，把它扶正', W / 2, 210, '#ffe9b0', 22)
      }
      button(ctx, 24, '◀', left)
      button(ctx, W - 120, '▶', right)
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
