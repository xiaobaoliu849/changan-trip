const SPONSORS = [
  { id: 'workbuddy', name: 'WorkBuddy', src: '/assets/brand/workbuddy.webp' },
  { id: 'mcdonalds', name: '麦当劳', src: '/assets/brand/mcdonalds.webp' },
  { id: 'yuanbao', name: '元宝搜索', src: '/assets/brand/yuanbao.webp' },
  { id: 'doubao', name: '豆包工作', src: '/assets/brand/doubao.webp' },
  { id: 'opendev', name: 'OpenDev', src: '/assets/brand/opendev.webp' },
  { id: 'toklens', name: 'toklens', src: '/assets/brand/toklens.webp' },
  { id: 'jd', name: '京东', src: '/assets/brand/jd.webp' },
]

export default function Credits() {
  return (
    <footer className="credits">
      <div className="cr-host">
        <img className="cr-waytoagi" src="/assets/brand/waytoagi.svg" alt="WaytoAGI" />
        <span>WaytoAGI 全国 1024 切磋大会 · 游戏赛道作品</span>
      </div>
      <div className="cr-venue">
        📍 西安主会场：<b>西安曲江京东MALL</b>（雁塔区曲江大道与南三环交界 · 曲江汉华城）
      </div>
      <div className="cr-label">全国合作伙伴（排名不分先后）</div>
      <div className="cr-row">
        {SPONSORS.map((s) => (
          <span key={s.id} className="sponsor-card" title={s.name}>
            <img className="mark" src={s.src} alt={s.name} />
          </span>
        ))}
      </div>
      <div className="cr-powered">
        <span className="evermind-pill" title="EverMind · EverOS">
          <img className="evermind-mark" src="/assets/brand/evermind-gold.svg" alt="EverMind" />
          <span>长期记忆 <b>EverMind</b></span>
        </span>
        <span className="cr-dot">·</span>
        <span className="cr-tech">AI 算力支持 OpenDev</span>
      </div>
    </footer>
  )
}
