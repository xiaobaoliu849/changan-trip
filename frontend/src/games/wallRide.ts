import { H, W, drawSprite, floatText, hearts, hud, rand, type GameFactory } from './engine'

interface Obstacle {
  x: number
  kind: 'tourist' | 'selfie' | 'drum'
}

const TIME = 30
const TOTAL_KM = 13.74
const GROUND = H - 120
const LABEL = { tourist: '游客', selfie: '自拍杆', drum: '鼓' }
const EMOJI = { tourist: '🚶', selfie: '🤳', drum: '🥁' }

export const wallRide: GameFactory = ({ assets, finish, options }) => {
  const warn = String(options.wall_warn || '')
  const obstacles: Obstacle[] = []
  const hits: { segment: number; kind: Obstacle['kind'] }[] = []
  let t = 0
  let y = 0
  let vy = 0
  let jumps = 0
  let spawn = 1.2
  let scroll = 0
  let invuln = 0
  let over = false

  const segment = () => Math.min(3, 1 + Math.floor((t / TIME) * 3))

  const jump = () => {
    if (over) return
    if (jumps < 2) {
      vy = jumps === 0 ? -720 : -560
      jumps++
    }
  }

  const end = (passed: boolean) => {
    over = true
    const km = Math.min(TOTAL_KM, (t / TIME) * TOTAL_KM).toFixed(1)
    const where = hits.length
      ? '；' + [1, 2, 3]
          .map((s) => {
            const hs = hits.filter((h) => h.segment === s)
            return hs.length ? `第${s}段撞了${hs.length}次（${[...new Set(hs.map((h) => LABEL[h.kind]))].join('、')}）` : ''
          })
          .filter(Boolean)
          .join('，')
      : '，一次都没撞'
    finish({ passed, detail: `骑城墙骑了${km}公里${where}${passed ? '，骑完一整圈' : '，骑不动了'}` })
  }

  return {
    update(dt) {
      if (over) return
      t += dt
      const speed = 300 + t * 7
      scroll += speed * dt
      invuln = Math.max(0, invuln - dt)
      vy += 1900 * dt
      y = Math.min(0, y + vy * dt)
      if (y === 0) {
        vy = 0
        jumps = 0
      }
      spawn -= dt
      if (spawn <= 0) {
        spawn = rand(0.9, 1.6) - t * 0.012
        const kinds: Obstacle['kind'][] = ['tourist', 'selfie', 'drum']
        obstacles.push({ x: W + 40, kind: kinds[Math.floor(Math.random() * kinds.length)] })
      }
      for (const o of obstacles) o.x -= speed * dt
      for (let i = obstacles.length - 1; i >= 0; i--) {
        const o = obstacles[i]
        if (o.x < -60) obstacles.splice(i, 1)
        else if (invuln === 0 && Math.abs(o.x - 110) < 36 && y > -60) {
          hits.push({ segment: segment(), kind: o.kind })
          invuln = 1
          obstacles.splice(i, 1)
        }
      }
      if (hits.length >= 3) end(false)
      else if (t >= TIME) end(true)
    },
    draw(ctx) {
      // Parallax: the background scrolls slowly, repeating mirrored tiles.
      const bg = assets.bg
      const s = H / bg.height
      const bw = bg.width * s
      const off = (scroll * 0.25) % bw
      for (let k = -1; k < 3; k++) ctx.drawImage(bg, k * bw - off, 0, bw, H)
      // WaytoAGI 1024 banners hanging from the parapet
      for (let k = 0; k < 3; k++) {
        const bx = ((k * 420 + 200 - scroll * 0.6) % 1260 + 1260) % 1260 - 200
        ctx.fillStyle = '#b8322a'
        ctx.fillRect(bx, GROUND - 150, 150, 46)
        ctx.strokeStyle = '#e9a93b'
        ctx.lineWidth = 3
        ctx.strokeRect(bx + 4, GROUND - 146, 142, 38)
        ctx.fillStyle = '#ffe9b0'
        ctx.font = 'bold 17px "PingFang SC", sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('WaytoAGI · 1024', bx + 75, GROUND - 121)
      }
      // Wall walkway
      ctx.fillStyle = '#7a5a43'
      ctx.fillRect(0, GROUND, W, H - GROUND)
      ctx.fillStyle = '#5e4331'
      for (let k = 0; k < 14; k++) {
        const bx = ((k * 60 - scroll) % (W + 60) + W + 60) % (W + 60) - 60
        ctx.fillRect(bx, GROUND + 10, 50, 14)
        ctx.fillRect(bx + 25, GROUND + 40, 50, 14)
      }
      for (const o of obstacles) {
        ctx.font = '54px serif'
        ctx.textAlign = 'center'
        ctx.fillText(EMOJI[o.kind], o.x, GROUND + 4)
      }
      // Hero on a bike
      const px = 110
      const py = GROUND + y
      if (invuln === 0 || Math.floor(invuln * 10) % 2 === 0) {
        ctx.strokeStyle = '#2d1a0e'
        ctx.lineWidth = 5
        const spin = scroll / 20
        for (const wx of [px - 30, px + 30]) {
          ctx.beginPath()
          ctx.arc(wx, py - 18, 18, 0, Math.PI * 2)
          ctx.stroke()
          ctx.beginPath()
          ctx.moveTo(wx, py - 18)
          ctx.lineTo(wx + Math.cos(spin) * 18, py - 18 + Math.sin(spin) * 18)
          ctx.stroke()
        }
        ctx.beginPath()
        ctx.moveTo(px - 30, py - 18)
        ctx.lineTo(px, py - 40)
        ctx.lineTo(px + 30, py - 18)
        ctx.stroke()
        drawSprite(ctx, assets.hero, px, py - 30, 110)
      }
      const km = Math.min(TOTAL_KM, (t / TIME) * TOTAL_KM)
      hud(ctx, `🚲 ${km.toFixed(1)} / ${TOTAL_KM} km  第${segment()}段`, hearts(3 - hits.length))
      // Progress bar
      ctx.fillStyle = 'rgba(255,255,255,0.4)'
      ctx.fillRect(24, 64, W - 48, 8)
      ctx.fillStyle = '#ffcf5c'
      ctx.fillRect(24, 64, (W - 48) * (t / TIME), 8)
      if (warn && t < 4) floatText(ctx, `小俑：${warn}`, W / 2, 130, '#ffe9b0', 20)
    },
    pointer(_x, _y, down) {
      if (down) jump()
    },
    key(k, down) {
      if (down && (k === ' ' || k === 'ArrowUp' || k === 'w')) jump()
    },
  }
}
