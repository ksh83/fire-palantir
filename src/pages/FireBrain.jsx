import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import './FireBrain.css'

const TYPE_CONFIG = {
  fire:   { label: '화재',   icon: '🔥', color: '#e84040' },
  rescue: { label: '구조',   icon: '🚨', color: '#ffb300' },
  hazmat: { label: '화학',   icon: '☢️', color: '#00e5a0' },
  ems:    { label: '구급',   icon: '🚑', color: '#2fa8ff' },
  flood:  { label: '수재',   icon: '🌊', color: '#6c8fff' },
  other:  { label: '기타',   icon: '📋', color: '#6a7a8a' },
}

const SOURCE_CONFIG = {
  seed:           { label: '소방 교리',    icon: '🏛️', color: '#00e5a0', desc: '법령·훈련 교리' },
  auto_extracted: { label: 'AI 자동 추출', icon: '🤖', color: '#ffb300', desc: '출동 사례 AI 분석' },
  manual:         { label: '수동 등록',    icon: '📋', color: '#2fa8ff', desc: '지휘관 직접 등록' },
}

const TYPE_OPTS = [
  { value: '', label: '전체' },
  ...Object.entries(TYPE_CONFIG).map(([v, c]) => ({ value: v, label: c.label })),
]

export default function FireBrain() {
  const [items,      setItems]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [query,      setQuery]      = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [selected,   setSelected]   = useState(null)
  const [stats,      setStats]      = useState(null)
  const [searching,  setSearching]  = useState(false)

  const isConfigured = !!import.meta.env.VITE_SUPABASE_URL

  async function load(q = '', type = '') {
    if (!isConfigured) { setLoading(false); return }
    setLoading(true)
    setSearching(!!(q.trim() || type))
    try {
      if (q.trim()) {
        const { data } = await supabase.rpc('search_knowledge_text', { p_query: q, p_type: type || null, p_limit: 30 })
        setItems(data || [])
      } else {
        let qb = supabase.from('knowledge_items').select('*').order('created_at', { ascending: false })
        if (type) qb = qb.eq('incident_type', type)
        const { data } = await qb.limit(80)
        setItems(data || [])
      }
      const { data: kd } = await supabase.from('knowledge_items').select('source, incident_type')
      if (kd) {
        const bySource = kd.reduce((a, r) => { a[r.source] = (a[r.source] || 0) + 1; return a }, {})
        const byType   = kd.reduce((a, r) => { a[r.incident_type] = (a[r.incident_type] || 0) + 1; return a }, {})
        setStats({ total: kd.length, bySource, byType })
      }
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  function handleSearch(e) { e.preventDefault(); load(query, typeFilter) }
  function clearSearch() { setQuery(''); setTypeFilter(''); load('', '') }

  // 카테고리별 그룹핑
  const grouped = items.reduce((acc, item) => {
    const t = item.incident_type || 'other'
    if (!acc[t]) acc[t] = []
    acc[t].push(item)
    return acc
  }, {})

  const typeOrder = ['fire', 'rescue', 'hazmat', 'ems', 'flood', 'other']

  return (
    <div className="firebrain">

      {/* ── 지식 유입 현황 */}
      <div className="fb-flow-section">
        <div className="fb-flow-sources">
          {Object.entries(SOURCE_CONFIG).map(([key, cfg]) => (
            <div key={key} className="fb-source-card" style={{ borderColor: cfg.color + '44', background: cfg.color + '0d' }}>
              <span className="fb-source-icon">{cfg.icon}</span>
              <div className="fb-source-body">
                <div className="fb-source-label" style={{ color: cfg.color }}>{cfg.label}</div>
                <div className="fb-source-desc">{cfg.desc}</div>
              </div>
              <div className="fb-source-count" style={{ color: cfg.color }}>
                {stats?.bySource?.[key] ?? '—'}건
              </div>
            </div>
          ))}
        </div>

        <div className="fb-flow-arrow">
          <div className="fb-arrow-line" />
          <div className="fb-arrow-head">▶</div>
        </div>

        <div className="fb-brain-core">
          <div className="fb-brain-pulse" />
          <div className="fb-brain-icon">🧠</div>
          <div className="fb-brain-count">{stats?.total ?? '—'}</div>
          <div className="fb-brain-label">전술 지식</div>
        </div>

        <div className="fb-flow-arrow">
          <div className="fb-arrow-line" />
          <div className="fb-arrow-head">▶</div>
        </div>

        <div className="fb-flow-outputs">
          <div className="fb-output-card">
            <span>⚡</span><span>현장 지휘 즉시 브리핑</span>
          </div>
          <div className="fb-output-card">
            <span>🎯</span><span>유사 사례 자동 검색</span>
          </div>
          <div className="fb-output-card">
            <span>📡</span><span>무전 분석 지원</span>
          </div>
        </div>
      </div>

      {/* ── 검색 바 */}
      <form className="fb-search-bar" onSubmit={handleSearch}>
        <input className="input fb-input"
          placeholder="전술 검색... 예: 고층화재 진입, 화학물질 경계선, PAR 절차"
          value={query} onChange={e => setQuery(e.target.value)} />
        <select className="select fb-select" value={typeFilter}
          onChange={e => { setTypeFilter(e.target.value); load(query, e.target.value) }}>
          {TYPE_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button className="btn btn-primary" type="submit">검색</button>
        {searching && <button className="btn btn-ghost" type="button" onClick={clearSearch}>✕ 초기화</button>}
      </form>

      {!isConfigured && (
        <div className="fb-notice">Supabase 연결 후 전술지능센터를 활용할 수 있습니다.</div>
      )}

      {/* ── 메인 바디 */}
      <div className={`fb-body ${selected ? 'has-detail' : ''}`}>

        {/* ── 지식 매트릭스 */}
        <div className="fb-matrix">
          {loading && <div className="loading"><div className="spinner"/>로딩 중...</div>}

          {!loading && items.length === 0 && (
            <div className="fb-empty">
              {query ? `"${query}" 검색 결과 없음` : '지식 항목이 없습니다. 시뮬레이션 탭에서 시나리오를 실행하세요.'}
            </div>
          )}

          {/* 검색 중: 플랫 리스트 */}
          {!loading && searching && items.length > 0 && (
            <div className="fb-search-results">
              <div className="fb-results-label">{items.length}건 검색됨</div>
              {items.map(item => <KnowledgeCard key={item.id} item={item} selected={selected} onSelect={setSelected} />)}
            </div>
          )}

          {/* 기본: 카테고리 매트릭스 */}
          {!loading && !searching && (
            <div className="fb-category-grid">
              {typeOrder.map(type => {
                const grp = grouped[type]
                if (!grp?.length) return null
                const cfg = TYPE_CONFIG[type]
                return (
                  <div key={type} className={`fb-category-card ${selected?.incident_type === type ? 'fb-cat-active' : ''}`}
                    style={{ '--cat-color': cfg.color }}>
                    <div className="fb-cat-header">
                      <span className="fb-cat-icon">{cfg.icon}</span>
                      <span className="fb-cat-label" style={{ color: cfg.color }}>{cfg.label} 전술</span>
                      <span className="fb-cat-count" style={{ background: cfg.color + '22', color: cfg.color }}>{grp.length}건</span>
                    </div>
                    <div className="fb-cat-items">
                      {grp.map(item => <KnowledgeCard key={item.id} item={item} selected={selected} onSelect={setSelected} compact />)}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── 상세 패널 */}
        <div className={`fb-detail-panel ${selected ? 'visible' : ''}`}>
          {!selected ? null : (
            <DetailPanel item={selected} onClose={() => setSelected(null)} />
          )}
        </div>
      </div>
    </div>
  )
}

// ── 지식 카드 ─────────────────────────────────────────────────────
function KnowledgeCard({ item, selected, onSelect, compact = false }) {
  const cfg  = TYPE_CONFIG[item.incident_type] || TYPE_CONFIG.other
  const src  = SOURCE_CONFIG[item.source] || { label: item.source, color: '#6a7a8a' }
  const isActive = selected?.id === item.id
  return (
    <button className={`fb-item ${isActive ? 'active' : ''} ${compact ? 'compact' : ''}`}
      onClick={() => onSelect(isActive ? null : item)}>
      <div className="fb-item-top">
        <span className="fb-src-dot" style={{ background: src.color }} title={src.label} />
        <span className="fb-item-title">{item.title}</span>
      </div>
      {!compact && (
        <div className="fb-item-preview">{item.content.slice(0, 80)}...</div>
      )}
      {item.tags?.length > 0 && (
        <div className="fb-item-tags">
          {item.tags.slice(0, 3).map(t => <span key={t} className="fb-tag">#{t}</span>)}
        </div>
      )}
    </button>
  )
}

// ── 상세 패널 ─────────────────────────────────────────────────────
function DetailPanel({ item, onClose }) {
  const cfg = TYPE_CONFIG[item.incident_type] || TYPE_CONFIG.other
  const src = SOURCE_CONFIG[item.source] || { label: item.source, icon: '📋', color: '#6a7a8a', desc: '' }
  return (
    <div className="fb-detail">
      <div className="fb-detail-header" style={{ borderLeftColor: cfg.color }}>
        <div className="fb-detail-meta">
          <span className="fb-detail-type" style={{ background: cfg.color + '22', color: cfg.color }}>
            {cfg.icon} {cfg.label}
          </span>
          <span className="fb-detail-src" style={{ background: src.color + '22', color: src.color }}>
            {src.icon} {src.label}
          </span>
          <span className="fb-detail-date">{new Date(item.created_at).toLocaleDateString('ko-KR')}</span>
        </div>
        <button className="btn btn-ghost" style={{ padding:'4px 8px', flexShrink:0 }} onClick={onClose}>✕</button>
      </div>

      <h2 className="fb-detail-title">{item.title}</h2>

      <div className="fb-detail-content">{item.content}</div>

      {item.tags?.length > 0 && (
        <div className="fb-detail-section">
          <div className="fb-detail-section-label">태그</div>
          <div className="fb-detail-tags">
            {item.tags.map(t => <span key={t} className="fb-tag">{t}</span>)}
          </div>
        </div>
      )}

      {item.building_type && (
        <div className="fb-detail-section">
          <div className="fb-detail-section-label">적용 건물 유형</div>
          <div className="fb-detail-building">{item.building_type}</div>
        </div>
      )}

      <div className="fb-detail-usage">
        <div className="fb-detail-section-label">AI 코파일럿 활용</div>
        <div className="fb-usage-chips">
          <span className="fb-usage-chip">⚡ 현장 지휘 즉시 참조</span>
          <span className="fb-usage-chip">🎯 유사 사고 매칭</span>
          <span className="fb-usage-chip">📡 무전 분석 보조</span>
        </div>
      </div>
    </div>
  )
}
