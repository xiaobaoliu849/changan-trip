import { H, W, drawSprite, floatText, hearts, hud, photoMode, rand, roundRect, type GameFactory } from './engine'

interface Obstacle {
  x: number
  kind: 'tourist' | 'selfie' | 'drum'
}

const TIME = 30
const TOTAL_KM = 13.74
const GROUND = H - 150
// The background is zoomed so the wall fills the screen: its walkway edge (y≈640 of 768) lands on GROUND.
const BG_ZOOM = 1.25
const BG_EDGE = 640
const PX = 110 // the rider's x
const FONT = '"PingFang SC", "Microsoft YaHei", sans-serif'
const BANNER = 'WaytoAGI · 1024'
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
        else if (invuln === 0 && Math.abs(o.x - PX) < 40 && y > -66) {
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
      const s = BG_ZOOM * (H / bg.height)
      const bw = bg.width * s
      const by = GROUND - BG_EDGE * (H / bg.height) * BG_ZOOM
      const off = (scroll * 0.25) % bw
      for (let k = -1; k < 3; k++) ctx.drawImage(bg, k * bw - off, by, bw, bg.height * s)
      // WaytoAGI 1024 signs on two posts, standing on the parapet above the rider's head
      ctx.font = `bold 18px ${FONT}`
      const bwid = ctx.measureText(BANNER).width + 30
      const top = GROUND - 262
      for (let k = 0; k < 2; k++) {
        const bx = ((k * 360 - scroll * 0.6) % 720 + 720) % 720 - bwid
        ctx.fillStyle = '#4a2e1c'
        ctx.fillRect(bx + 14, top + 40, 5, 52)
        ctx.fillRect(bx + bwid - 19, top + 40, 5, 52)
        ctx.fillStyle = '#b8322a'
        roundRect(ctx, bx, top, bwid, 44, 6)
        ctx.fill()
        ctx.strokeStyle = '#e9a93b'
        ctx.lineWidth = 2.5
        roundRect(ctx, bx + 4, top + 4, bwid - 8, 36, 4)
        ctx.stroke()
        ctx.fillStyle = '#ffe9b0'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(BANNER, bx + bwid / 2, top + 23)
      }
      ctx.textBaseline = 'alphabetic'
      // Front face of the wall
      ctx.fillStyle = '#7a5a43'
      ctx.fillRect(0, GROUND, W, H - GROUND)
      ctx.fillStyle = '#4a2e1c'
      ctx.fillRect(0, GROUND, W, 6)
      ctx.fillStyle = '#5e4331'
      for (let k = 0; k < 14; k++) {
        const bx = ((k * 60 - scroll) % (W + 60) + W + 60) % (W + 60) - 60
        ctx.fillRect(bx, GROUND + 16, 50, 14)
        ctx.fillRect(bx + 25, GROUND + 44, 50, 14)
      }
      for (const o of obstacles) {
        ctx.font = '66px serif'
        ctx.textAlign = 'center'
        ctx.fillText(EMOJI[o.kind], o.x, GROUND + 6)
      }
      // Hero on a bike
      const py = GROUND + y
      if (invuln === 0 || Math.floor(invuln * 10) % 2 === 0) {
        ctx.strokeStyle = '#2d1a0e'
        ctx.lineWidth = 6
        ctx.lineCap = 'round'
        const spin = scroll / 24
        for (const wx of [PX - 36, PX + 36]) {
          ctx.beginPath()
          ctx.arc(wx, py - 24, 24, 0, Math.PI * 2)
          ctx.stroke()
          ctx.beginPath()
          ctx.moveTo(wx, py - 24)
          ctx.lineTo(wx + Math.cos(spin) * 24, py - 24 + Math.sin(spin) * 24)
          ctx.stroke()
        }
        ctx.beginPath()
        ctx.moveTo(PX - 36, py - 24)
        ctx.lineTo(PX - 4, py - 50)
        ctx.lineTo(PX + 36, py - 24)
        ctx.moveTo(PX + 30, py - 56)
        ctx.lineTo(PX + 36, py - 24)
        ctx.stroke()
        drawSprite(ctx, assets.hero, PX, py - 40, 140)
        // 小俑 rides in a wicker basket over the front wheel.
        drawSprite(ctx, assets.xiaoyong, PX + 56, py - 52, 58)
        ctx.fillStyle = '#a8743f'
        roundRect(ctx, PX + 34, py - 70, 44, 22, 5)
        ctx.fill()
        ctx.strokeStyle = '#5e3b1c'
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.beginPath()
        for (let k = 1; k < 4; k++) {
          ctx.moveTo(PX + 34 + k * 11, py - 68)
          ctx.lineTo(PX + 34 + k * 11, py - 50)
        }
        ctx.stroke()
      }
      if (invuln > 0.5) floatText(ctx, '哎哟！', PX + 56, py - 118, '#ff8a65', 18)
      const km = Math.min(TOTAL_KM, (t / TIME) * TOTAL_KM)
      hud(ctx, `🚲 ${km.toFixed(1)} / ${TOTAL_KM} km  第${segment()}段`, hearts(3 - hits.length))
      if (!photoMode) {
        // A road map of the lap along the bottom: three segments, a bike marker and the finish flag.
        const ry = H - 52
        const rx0 = 40
        const rx1 = W - 56
        ctx.save()
        ctx.fillStyle = 'rgba(30, 18, 10, 0.45)'
        roundRect(ctx, 16, ry - 34, W - 32, 72, 14)
        ctx.fill()
        ctx.strokeStyle = 'rgba(255, 246, 224, 0.35)'
        ctx.lineWidth = 6
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(rx0, ry)
        ctx.lineTo(rx1, ry)
        ctx.stroke()
        ctx.strokeStyle = '#ffcf5c'
        ctx.beginPath()
        ctx.moveTo(rx0, ry)
        ctx.lineTo(rx0 + (rx1 - rx0) * Math.min(1, t / TIME), ry)
        ctx.stroke()
        ctx.font = `bold 13px ${FONT}`
        ctx.textAlign = 'center'
        for (let k = 0; k < 3; k++) {
          const sx = rx0 + ((rx1 - rx0) * (k + 0.5)) / 3
          ctx.fillStyle = segment() === k + 1 ? '#ffcf5c' : 'rgba(255, 246, 224, 0.7)'
          ctx.fillText(`第${k + 1}段`, sx, ry + 26)
          if (k) {
            ctx.fillStyle = 'rgba(255, 246, 224, 0.6)'
            ctx.fillRect(rx0 + ((rx1 - rx0) * k) / 3 - 1, ry - 7, 2, 14)
          }
        }
        ctx.font = '26px serif'
        ctx.fillText('🏁', rx1 + 16, ry + 9)
        ctx.fillText('🚲', rx0 + (rx1 - rx0) * Math.min(1, t / TIME), ry - 8)
        ctx.restore()
      }
      if (warn && t < 4) floatText(ctx, `小俑：${warn}`, W / 2, 130, '#ffe9b0', 20)
      else if (t < 3.5) floatText(ctx, '点击屏幕 / 空格 跳，空中还能再跳一下', W / 2, 130, '#ffe9b0', 19)
    },
    pointer(_x, _y, down) {
      if (down) jump()
    },
    key(k, down) {
      if (down && (k === ' ' || k === 'ArrowUp' || k === 'w')) jump()
    },
  }
}
