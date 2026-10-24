import { useState, type ReactNode } from 'react'

interface Partner {
  id: string
  name: string
  accent: string
  icon: ReactNode
}

const PARTNERS: Partner[] = [
  {
    id: 'evermind',
    name: 'EverMind · EverOS',
    accent: '#6d28d9',
    icon: (
      <svg viewBox="0 0 20 20" width="14" height="14" fill="none">
        <rect x="1.5" y="1.5" width="17" height="17" rx="4.5" fill="url(#em-grad)" />
        <path
          d="M6.2 10c0-1.6 1.1-2.7 2.4-2.7 1 0 1.8.6 2.4 1.6.6-1 1.4-1.6 2.4-1.6 1.3 0 2.4 1.1 2.4 2.7s-1.1 2.7-2.4 2.7c-1 0-1.8-.6-2.4-1.6-.6 1-1.4 1.6-2.4 1.6-1.3 0-2.4-1.1-2.4-2.7z"
          stroke="#fff"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <defs>
          <linearGradient id="em-grad" x1="2" y1="2" x2="18" y2="18" gradientUnits="userSpaceOnUse">
            <stop stopColor="#7c3aed" />
            <stop offset="1" stopColor="#4f46e5" />
          </linearGradient>
        </defs>
      </svg>
    ),
  },
  {
    id: 'jd',
    name: '京东 · 曲江京东MALL',
    accent: '#e1251b',
    icon: (
      <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor">
        <rect x="2" y="3" width="16" height="14" rx="3.5" fill="#e1251b" />
        <text x="10" y="13" textAnchor="middle" fill="#fff" fontSize="8.5" fontWeight="900" fontFamily="Arial, sans-serif">
          JD
        </text>
      </svg>
    ),
  },
  {
    id: 'workbuddy',
    name: 'WorkBuddy',
    accent: '#2563eb',
    icon: (
      <svg viewBox="0 0 20 20" width="14" height="14" fill="none">
        <rect x="2" y="2" width="16" height="16" rx="4" fill="#2563eb" />
        <path d="M5.5 7l2.2 6 2.3-4.5L12.3 13l2.2-6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'mcdonalds',
    name: '麦当劳',
    accent: '#d90007',
    icon: (
      <svg viewBox="0 0 20 20" width="14" height="14" fill="none">
        <rect x="2" y="2" width="16" height="16" rx="4" fill="#da291c" />
        <path d="M5.2 14.5C5.2 9.2 6.6 6 7.8 6c1.1 0 2.1 2.6 2.2 6.8.1-4.2 1.1-6.8 2.2-6.8 1.2 0 2.6 3.2 2.6 8.5" stroke="#ffc72c" strokeWidth="1.9" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'yuanbao',
    name: '元宝搜索',
    accent: '#00a870',
    icon: (
      <svg viewBox="0 0 20 20" width="14" height="14" fill="none">
        <circle cx="10" cy="10" r="8" fill="#00a870" />
        <path d="M5.5 9.5c1-2 2.8-3 4.5-3s3.5 1 4.5 3c-.7 2.6-2.4 4.2-4.5 4.2S6.2 12.1 5.5 9.5z" fill="#fff" />
      </svg>
    ),
  },
  {
    id: 'doubao',
    name: '豆包工作',
    accent: '#3b82f6',
    icon: (
      <svg viewBox="0 0 20 20" width="14" height="14" fill="none">
        <circle cx="10" cy="10" r="8" fill="#3b82f6" />
        <circle cx="7.6" cy="9.2" r="1.3" fill="#fff" />
        <circle cx="12.4" cy="9.2" r="1.3" fill="#fff" />
        <path d="M7.5 12.5c1.3 1.2 3.7 1.2 5 0" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'opendev',
    name: 'OpenDev',
    accent: '#0f172a',
    icon: (
      <svg viewBox="0 0 20 20" width="14" height="14" fill="none">
        <rect x="2" y="2" width="16" height="16" rx="4" fill="#1e293b" />
        <path d="M7.5 7.5L5 10l2.5 2.5M12.5 7.5L15 10l-2.5 2.5" stroke="#38bdf8" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'toklens',
    name: 'toklens',
    accent: '#7c3aed',
    icon: (
      <svg viewBox="0 0 20 20" width="14" height="14" fill="none">
        <rect x="2" y="2" width="16" height="16" rx="4" fill="#7c3aed" />
        <path d="M10 4.8l1.4 3.8 3.8 1.4-3.8 1.4L10 15.2 8.6 11.4 4.8 10l3.8-1.4L10 4.8z" fill="#fff" />
      </svg>
    ),
  },
  {
    id: 'boguan',
    name: '北京博观芯智',
    accent: '#0284c7',
    icon: (
      <svg viewBox="0 0 20 20" width="14" height="14" fill="none">
        <rect x="4" y="4" width="12" height="12" rx="2.5" fill="#0284c7" />
        <rect x="7" y="7" width="6" height="6" rx="1" stroke="#fff" strokeWidth="1.4" />
      </svg>
    ),
  },
]

function PartnerBadge({ id, name, icon }: Partner) {
  const [imgOk, setImgOk] = useState(false)
  return (
    <span className="sponsor-badge" title={name}>
      <img
        className="mark"
        src={`/assets/brand/${id}.png`}
        alt=""
        style={{ display: imgOk ? 'inline-block' : 'none' }}
        onLoad={() => setImgOk(true)}
        onError={() => setImgOk(false)}
      />
      {!imgOk && <span className="sponsor-icon">{icon}</span>}
      <span className="sponsor-name">{name}</span>
    </span>
  )
}

export default function Credits() {
  return (
    <footer className="credits">
      <div className="cr-host">
        <span className="cr-badge-1024">1024</span>
        <span>WaytoAGI 全国 1024 切磋大会 · 游戏赛道作品</span>
      </div>
      <div className="cr-venue">
        📍 西安主会场：<b>西安曲江京东MALL</b>（雁塔区曲江路618号 · 大雁塔商圈）
      </div>
      <div className="cr-label">赛事赞助商与合作伙伴（排名不分先后）</div>
      <div className="cr-row">
        {PARTNERS.map((p) => (
          <PartnerBadge key={p.id} {...p} />
        ))}
      </div>
      <div className="cr-tech">长期记忆 by EverMind (EverOS) · AI 生图与智能 by OpenAI Next</div>
    </footer>
  )
}
