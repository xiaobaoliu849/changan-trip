import { useState } from 'react'

// Drop a logo at public/assets/brand/<id>.png to show it; otherwise the name is shown as text.
const PARTNERS = [
  { id: 'workbuddy', name: 'WorkBuddy' },
  { id: 'mcdonalds', name: '麦当劳' },
  { id: 'yuanbao', name: '元宝搜索' },
  { id: 'doubao', name: '豆包工作' },
  { id: 'opendev', name: 'OpenDev' },
  { id: 'toklens', name: 'toklens' },
  { id: 'jd', name: '京东' },
  { id: 'boguan', name: '北京博观芯智' },
]

function Mark({ id, name }: { id: string; name: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <span className="mark-text">{name}</span>
  return <img className="mark" src={`/assets/brand/${id}.png`} alt={name} title={name} onError={() => setFailed(true)} />
}

export default function Credits() {
  return (
    <footer className="credits">
      <div className="cr-host">
        <Mark id="waytoagi" name="WaytoAGI" />
        <span>WaytoAGI 全国 1024 切磋大会 · 游戏赛道作品</span>
      </div>
      <div className="cr-label">全国合作伙伴（排名不分先后）</div>
      <div className="cr-row">
        {PARTNERS.map((p) => (
          <Mark key={p.id} {...p} />
        ))}
      </div>
      <div className="cr-tech">记忆 by EverOS · 声音与画面 by Gemini</div>
    </footer>
  )
}
