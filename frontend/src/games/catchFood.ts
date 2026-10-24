import { FOODS, type FoodId } from '../api'
import { H, W, drawCover, drawSprite, floatText, hearts, hud, rand, roundRect, type GameFactory } from './engine'

interface Item {
  kind: FoodId | 'chili'
  x: number
  y: number
  vy: number
}

const NEED_EACH = 3
const TIME = 35

export const catchFood: GameFactory = ({ assets, finish, options }) => {
  const order = ((options.food_order as FoodId[]) || ['roujiamo', 'biangbiang', 'liangpi']).slice(0, 3)
  const chiliRate = options.spicy_tease ? 0.3 : 0.2
  const caught: Record<string, number> = {}
  const items: Item[] = []
  const pops: { text: string; x: number; y: number; t: number; color: string }[] = []
  let x = W / 2
  let left = false
  let right = false
  let dragX: number | null = null
  let spawn = 0
  let time = TIME
  let chili = 0
  let flash = 0
  let over = false

  const remaining = () => order.reduce((n, f) => n + Math.max(0, NEED_EACH - (caught[f] || 0)), 0)

  const end = (passed: boolean) => {
    over = true
    const got = Object.entries(caught)
      .filter(([k]) => k !== 'chili')
      .map(([k, n]) => `${FOODS[k as FoodId].name}×${n}`)
      .join('、')
    const extra = Object.keys(caught).filter((k) => k !== 'chili' && !order.includes(k as FoodId))
    const detail =
      `客人点了${order.map((f) => FOODS[f].name).join('、')}；接到${got || '什么都没接到'}` +
      (extra.length ? `（还顺手接了不在单子上的${extra.map((k) => FOODS[k as FoodId].name).join('、')}）` : '') +
      `；被辣子辣到${chili}次` +
      (passed ? `，${Math.round(TIME - time)}秒凑齐了订单` : chili >= 3 ? '，辣晕了' : `，时间到还差${remaining()}份`)
    finish({ passed, detail })
  }

  return {
    update(dt) {
      if (over) return
      time -= dt
      flash = Math.max(0, flash - dt)
      if (dragX !== null) x += (dragX - x) * Math.min(1, dt * 14)
      else x += ((right ? 1 : 0) - (left ? 1 : 0)) * 420 * dt
      x = Math.max(40, Math.min(W - 40, x))

      spawn -= dt
      if (spawn <= 0) {
        spawn = rand(0.45, 0.8)
        const r = Math.random()
        const all = Object.keys(FOODS) as FoodId[]
        const kind: Item['kind'] =
          r < chiliRate ? 'chili' : r < 0.75 ? order[Math.floor(Math.random() * order.length)] : all[Math.floor(Math.random() * all.length)]
        items.push({ kind, x: rand(40, W - 40), y: 80, vy: rand(170, 260) + (TIME - time) * 4 })
      }
      for (const it of items) it.y += it.vy * dt
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i]
        if (it.y > H - 150 && it.y < H - 60 && Math.abs(it.x - x) < 44) {
          items.splice(i, 1)
          caught[it.kind] = (caught[it.kind] || 0) + 1
          if (it.kind === 'chili') {
            chili++
            flash = 0.4
            pops.push({ text: '好辣！', x: it.x, y: it.y - 40, t: 0.8, color: '#ff5a36' })
          } else if (order.includes(it.kind) && caught[it.kind] <= NEED_EACH) {
            pops.push({ text: `+${FOODS[it.kind].name}`, x: it.x, y: it.y - 40, t: 0.8, color: '#ffe066' })
          } else {
            pops.push({ text: '顺手吃了', x: it.x, y: it.y - 40, t: 0.8, color: '#d0f0ff' })
          }
        } else if (it.y > H + 40) items.splice(i, 1)
      }
      for (const p of pops) {
        p.t -= dt
        p.y -= 40 * dt
      }
      if (chili >= 3) end(false)
      else if (remaining() === 0) end(true)
      else if (time <= 0) end(false)
    },
    draw(ctx) {
      drawCover(ctx, assets.bg)
      ctx.fillStyle = 'rgba(0,0,0,0.15)'
      ctx.fillRect(0, 0, W, H)
      // Order card
      ctx.fillStyle = 'rgba(255, 246, 224, 0.93)'
      roundRect(ctx, 12, 66, W - 24, 52, 12)
      ctx.fill()
      ctx.font = 'bold 18px "PingFang SC", "Microsoft YaHei", sans-serif'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = '#5a2d12'
      ctx.textAlign = 'left'
      ctx.fillText('订单', 26, 92)
      ctx.font = 'bold 15px "PingFang SC", "Microsoft YaHei", sans-serif'
      order.forEach((f, i) => {
        const done = Math.min(NEED_EACH, caught[f] || 0)
        const name = FOODS[f].name.replace('biangbiang', 'biang')
        ctx.fillStyle = done >= NEED_EACH ? '#2f7a64' : '#5a2d12'
        ctx.fillText(`${FOODS[f].emoji}${name} ${done}/${NEED_EACH}`, 72 + i * ((W - 90) / 3), 92)
      })
      for (const it of items) {
        ctx.font = '44px serif'
        ctx.textAlign = 'center'
        ctx.fillText(it.kind === 'chili' ? '🌶️' : FOODS[it.kind].emoji, it.x, it.y)
      }
      drawSprite(ctx, assets.hero, x, H - 40, 130)
      for (const p of pops) if (p.t > 0) floatText(ctx, p.text, p.x, p.y, p.color, 22)
      if (flash > 0) {
        ctx.fillStyle = `rgba(255, 60, 30, ${flash * 0.6})`
        ctx.fillRect(0, 0, W, H)
      }
      hud(ctx, `⏱ ${Math.max(0, Math.ceil(time))}s`, `辣度 ${'🌶️'.repeat(chili)}${'·'.repeat(3 - chili)}  ${hearts(3 - chili)}`)
    },
    pointer(px, _y, down) {
      dragX = down ? px : null
    },
    move(px) {
      if (dragX !== null) dragX = px
    },
    key(k, down) {
      if (k === 'ArrowLeft' || k === 'a') left = down
      if (k === 'ArrowRight' || k === 'd') right = down
    },
  }
}
