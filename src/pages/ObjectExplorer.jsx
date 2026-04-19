import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import './ObjectExplorer.css'

const OBJECT_TYPES = [
  { key: 'incidents', label: 'Incident',  labelKr: '사고',   table: 'incidents', icon: '🚨', color: '#e84040' },
  { key: 'vehicles',  label: 'Vehicle',   labelKr: '차량',   table: 'vehicles',  icon: '🚒', color: '#ff6b35' },
  { key: 'personnel', label: 'Personnel', labelKr: '인원',   table: 'personnel', icon: '👤', color: '#2fa8ff' },
  { key: 'stations',  label: 'Station',   labelKr: '소방서', table: 'stations',  icon: '🏠', color: '#00e5a0' },
  { key: 'buildings', label: 'Building',  labelKr: '건물',   table: 'buildings', icon: '🏢', color: '#ffb300' },
]

const PROP_LABELS = {
  incidents: {
    title: '사고명', address: '위치', incident_type: '유형', severity: '위험도',
    status: '상태', reported_at: '접수일시', fire_stage: '화재단계',
    par_count: '진입 인원', hazmat_risk: '위험물', initial_report: '초기 보고',
    incident_number: '사고번호',
  },
  vehicles: {
    call_sign: '호출부호', vehicle_type: '차량 유형', status: '상태',
    crew_count: '승무원 수', license_plate: '차량번호',
  },
  personnel: {
    name: '이름', rank: '계급', role: '역할',
    certifications: '자격증', current_status: '현재 상태', shift: '근무조',
  },
  buildings: {
    name: '건물명', address: '주소', building_type: '용도', floors_above: '지상층수',
    floors_below: '지하층수', total_area_m2: '연면적(㎡)', has_sprinkler: '스프링클러',
    has_hazmat: '위험물 보관', hydrant_distance_m: '소화전 거리(m)', last_inspection: '최근 점검일',
    special_notes: '특이사항',
  },
  stations: {
    name: '소방서명', short_name: '약칭', district: '관할구역', address: '주소',
  },
}

const SHOW_PROPS = {
  incidents: ['incident_number','title','address','incident_type','severity','status','fire_stage','par_count','hazmat_risk','reported_at','initial_report'],
  vehicles:  ['call_sign','vehicle_type','status','crew_count','license_plate'],
  personnel: ['name','rank','role','certifications','current_status','shift'],
  buildings: ['name','building_type','address','floors_above','floors_below','total_area_m2','has_sprinkler','has_hazmat','hydrant_distance_m','last_inspection','special_notes'],
  stations:  ['name','short_name','district','address'],
}

const STATUS_KR = {
  standby:'대기', dispatched:'출동중', onscene:'현장', returning:'귀소', maintenance:'정비',
  on_duty:'근무', off_duty:'휴무',
  pending:'접수', controlled:'통제', closed:'종료',
}
const TYPE_KR = {
  fire:'화재', rescue:'구조', ems:'구급', hazmat:'화학',
  pump:'펌프', tank:'탱크', aerial:'고가', ladder:'굴절', command:'지휘', amb:'구급',
  '공장':'공장', '상업':'상업', '주거':'주거', '창고':'창고', '의료':'의료',
}

function fmt(val) {
  if (val === null || val === undefined) return null
  if (typeof val === 'boolean') return val ? '✓ 예' : '✗ 아니오'
  if (Array.isArray(val)) return val.join(', ')
  if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}T/)) {
    return new Date(val).toLocaleString('ko-KR', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' })
  }
  return String(val)
}

// ── 온톨로지 라이브 그래프 (빈 상태용) ────────────────────────────
function LiveOntologyGraph({ counts, onNodeClick, activeType }) {
  // 560×340 뷰박스 — 5개 노드를 넓게 배치
  const nodes = [
    { key:'incidents', icon:'🚨', label:'Incident',  labelKr:'사고',   x:280, y:170, color:'#e84040' },
    { key:'vehicles',  icon:'🚒', label:'Vehicle',   labelKr:'차량',   x:100, y:80,  color:'#ff6b35' },
    { key:'personnel', icon:'👤', label:'Personnel', labelKr:'인원',   x:460, y:80,  color:'#2fa8ff' },
    { key:'stations',  icon:'🏠', label:'Station',   labelKr:'소방서', x:100, y:260, color:'#00e5a0' },
    { key:'buildings', icon:'🏢', label:'Building',  labelKr:'건물',   x:460, y:260, color:'#ffb300' },
  ]
  const edges = [
    { from:'incidents', to:'vehicles',  label:'출동' },
    { from:'incidents', to:'personnel', label:'지휘관' },
    { from:'incidents', to:'buildings', label:'위치' },
    { from:'vehicles',  to:'stations',  label:'소속' },
    { from:'personnel', to:'stations',  label:'소속' },
  ]
  const nodeMap = Object.fromEntries(nodes.map(n => [n.key, n]))

  return (
    <svg viewBox="0 0 560 340" className="live-ontology-svg">
      <defs>
        <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
          <path d="M0,0 L8,3 L0,6 Z" fill="#3a4a5e" />
        </marker>
      </defs>

      {/* 엣지 */}
      {edges.map((e, i) => {
        const f = nodeMap[e.from], t = nodeMap[e.to]
        const dx = t.x - f.x, dy = t.y - f.y
        const len = Math.sqrt(dx*dx + dy*dy)
        const r = 36
        const x1 = f.x + dx/len*r, y1 = f.y + dy/len*r
        const x2 = t.x - dx/len*r, y2 = t.y - dy/len*r
        const mx = (x1+x2)/2, my = (y1+y2)/2
        const isActive = activeType === e.from || activeType === e.to
        return (
          <g key={i}>
            <line x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={isActive ? '#2fa8ff' : '#2a3a4e'}
              strokeWidth={isActive ? 1.5 : 1}
              strokeDasharray={isActive ? '5,3' : '4,4'}
              markerEnd="url(#arrowhead)"
              style={{ transition: 'stroke 0.3s' }}
            />
            <text x={mx} y={my-5} textAnchor="middle" fontSize="9" fill="#3a4a5e">{e.label}</text>
          </g>
        )
      })}

      {/* 노드 */}
      {nodes.map(n => {
        const isActive = activeType === n.key
        const count = counts[n.key]
        return (
          <g key={n.key} transform={`translate(${n.x},${n.y})`}
            style={{ cursor:'pointer' }}
            onClick={() => onNodeClick(n.key)}>
            {/* 외곽 발광 */}
            {isActive && (
              <circle r="44" fill={n.color} fillOpacity="0.08" />
            )}
            {/* 배경 원 */}
            <circle r="36"
              fill={isActive ? n.color + '22' : '#1a2636'}
              stroke={isActive ? n.color : '#2a3a4e'}
              strokeWidth={isActive ? 2 : 1.5}
              style={{ transition: 'all 0.3s' }}
            />
            {/* 아이콘 */}
            <text textAnchor="middle" dominantBaseline="central" fontSize="20" y="-6">{n.icon}</text>
            {/* 카운트 */}
            {count !== undefined && (
              <text textAnchor="middle" y="12" fontSize="11" fontWeight="700"
                fill={isActive ? n.color : '#4a6080'}>
                {count}
              </text>
            )}
            {/* 라벨 */}
            <text y="54" textAnchor="middle" fontSize="11" fontWeight="600"
              fill={isActive ? n.color : '#5a7090'}>
              {n.label}
            </text>
            <text y="66" textAnchor="middle" fontSize="9"
              fill={isActive ? n.color + 'aa' : '#3a5060'}>
              {n.labelKr}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ── 연결 객체 로딩 ─────────────────────────────────────────────────
async function loadRelations(obj, type) {
  const r = {}
  try {
    if (type === 'incidents') {
      const [bRes, cRes, dRes] = await Promise.all([
        obj.building_id  ? supabase.from('buildings').select('id,name,building_type,floors_above,has_hazmat').eq('id', obj.building_id).single() : Promise.resolve({data:null}),
        obj.commander_id ? supabase.from('personnel').select('id,name,rank,role').eq('id', obj.commander_id).single() : Promise.resolve({data:null}),
        supabase.from('dispatches').select('id,role_at_scene,vehicles(id,call_sign,vehicle_type,status)').eq('incident_id', obj.id).is('released_at', null),
      ])
      r.building   = bRes.data
      r.commander  = cRes.data
      r.dispatches = dRes.data || []
    }
    if (type === 'vehicles') {
      const [sRes, dRes] = await Promise.all([
        obj.station_id ? supabase.from('stations').select('id,name,short_name').eq('id', obj.station_id).single() : Promise.resolve({data:null}),
        supabase.from('dispatches').select('id,role_at_scene,incidents(id,title,status,incident_type)').eq('vehicle_id', obj.id).is('released_at', null).limit(1),
      ])
      r.station        = sRes.data
      r.active_dispatch = dRes.data?.[0] || null
    }
    if (type === 'personnel') {
      const [sRes, vRes] = await Promise.all([
        obj.station_id ? supabase.from('stations').select('id,name,short_name').eq('id', obj.station_id).single() : Promise.resolve({data:null}),
        obj.vehicle_id ? supabase.from('vehicles').select('id,call_sign,vehicle_type,status').eq('id', obj.vehicle_id).single() : Promise.resolve({data:null}),
      ])
      r.station = sRes.data
      r.vehicle = vRes.data
    }
    if (type === 'buildings') {
      const { data } = await supabase.from('incidents').select('id,title,status,incident_type,reported_at').eq('building_id', obj.id).order('reported_at', { ascending: false }).limit(5)
      r.incidents = data || []
    }
    if (type === 'stations') {
      const [vRes, pRes] = await Promise.all([
        supabase.from('vehicles').select('id,call_sign,vehicle_type,status').eq('station_id', obj.id),
        supabase.from('personnel').select('id,name,rank,current_status').eq('station_id', obj.id),
      ])
      r.vehicles  = vRes.data || []
      r.personnel = pRes.data || []
    }
  } catch (_) {}
  return r
}

// ── 연결 카드 컴포넌트 ─────────────────────────────────────────────
function RelCard({ icon, title, sub, badge, badgeColor, onClick }) {
  return (
    <div className={`rel-card ${onClick ? 'rel-card-link' : ''}`} onClick={onClick}>
      <span className="rel-card-icon">{icon}</span>
      <div className="rel-card-body">
        <div className="rel-card-title">{title}</div>
        {sub && <div className="rel-card-sub">{sub}</div>}
      </div>
      {badge && <span className="rel-card-badge" style={{ background: badgeColor + '22', color: badgeColor, borderColor: badgeColor + '44' }}>{badge}</span>}
    </div>
  )
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────
export default function ObjectExplorer() {
  const [selectedType, setSelectedType] = useState('incidents')
  const [objects,      setObjects]      = useState([])
  const [selected,     setSelected]     = useState(null)
  const [relations,    setRelations]    = useState(null)
  const [loading,      setLoading]      = useState(false)
  const [relLoading,   setRelLoading]   = useState(false)
  const [search,       setSearch]       = useState('')
  const [counts,       setCounts]       = useState({})

  const isConfigured = !!import.meta.env.VITE_SUPABASE_URL

  useEffect(() => {
    if (!isConfigured) return
    // 모든 타입의 카운트 조회
    Promise.all(OBJECT_TYPES.map(t =>
      supabase.from(t.table).select('*', { count:'exact', head:true }).then(({ count }) => [t.key, count || 0])
    )).then(entries => setCounts(Object.fromEntries(entries)))
  }, [])

  useEffect(() => {
    if (!isConfigured) return
    setSelected(null)
    setRelations(null)
    loadObjects(selectedType)
  }, [selectedType])

  useEffect(() => {
    if (!selected) { setRelations(null); return }
    setRelLoading(true)
    loadRelations(selected, selectedType).then(r => {
      setRelations(r)
      setRelLoading(false)
    })
  }, [selected])

  async function loadObjects(type) {
    setLoading(true)
    const info = OBJECT_TYPES.find(t => t.key === type)
    const { data } = await supabase.from(info.table).select('*').limit(60)
    setObjects(data || [])
    setLoading(false)
  }

  function jumpTo(type, obj) {
    setSelectedType(type)
    setObjects([]) // list will reload
    // slight delay so the list loads first
    setTimeout(() => setSelected(obj), 300)
  }

  const filtered = objects.filter(obj =>
    !search || JSON.stringify(obj).toLowerCase().includes(search.toLowerCase())
  )

  function getLabel(obj, type) {
    switch (type) {
      case 'incidents': return obj.title || obj.incident_number || obj.id
      case 'vehicles':  return obj.call_sign || obj.id
      case 'personnel': return `${obj.rank} ${obj.name}`
      case 'stations':  return obj.name || obj.id
      case 'buildings': return obj.name || obj.address || obj.id
      default: return obj.id
    }
  }
  function getSubLabel(obj, type) {
    switch (type) {
      case 'incidents': return `${TYPE_KR[obj.incident_type]||obj.incident_type} · ${STATUS_KR[obj.status]||obj.status}`
      case 'vehicles':  return `${TYPE_KR[obj.vehicle_type]||obj.vehicle_type} · ${STATUS_KR[obj.status]||obj.status}`
      case 'personnel': return `${obj.role} · ${STATUS_KR[obj.current_status]||obj.current_status}`
      case 'stations':  return obj.district
      case 'buildings': return `${obj.building_type} · 지상${obj.floors_above}층`
      default: return ''
    }
  }
  function getStatusColor(obj, type) {
    if (type === 'incidents') {
      if (obj.status === 'onscene' || obj.status === 'dispatched') return '#e84040'
      if (obj.status === 'controlled') return '#ffb300'
      if (obj.status === 'closed') return 'var(--text3)'
      return 'var(--warn)'
    }
    if (type === 'vehicles') {
      if (obj.status === 'onscene')    return '#e84040'
      if (obj.status === 'dispatched') return '#ffb300'
      if (obj.status === 'standby')    return '#00e5a0'
      return 'var(--text3)'
    }
    return 'var(--text3)'
  }

  const typeInfo = OBJECT_TYPES.find(t => t.key === selectedType)

  return (
    <div className="explorer">
      {/* ── 좌 사이드바: Object Types + Ontology Schema */}
      <aside className="explorer-sidebar">
        <div className="sidebar-section-title">Object Types</div>
        {OBJECT_TYPES.map(t => (
          <button key={t.key} className={`type-btn ${selectedType === t.key ? 'active' : ''}`}
            onClick={() => setSelectedType(t.key)}
            style={{ '--type-color': t.color }}>
            <span className="type-btn-icon">{t.icon}</span>
            <div className="type-btn-labels">
              <span className="type-btn-en">{t.label}</span>
              <span className="type-btn-kr">{t.labelKr}</span>
            </div>
            <span className="type-btn-count">
              {selectedType === t.key ? filtered.length : ''}
            </span>
          </button>
        ))}

        <div className="sidebar-divider" />
        <div className="sidebar-hint">
          객체 선택 시 연결된<br/>모든 관계가 표시됩니다
        </div>
      </aside>

      {/* ── 중앙: 객체 목록 */}
      <section className="explorer-list">
        <div className="list-header">
          <span className="list-type-badge" style={{ background: typeInfo.color + '22', color: typeInfo.color, border: `1px solid ${typeInfo.color}44` }}>
            {typeInfo.icon} {typeInfo.label}
          </span>
          <input className="input" style={{ marginBottom:0, flex:1 }}
            placeholder="검색..." value={search}
            onChange={e => setSearch(e.target.value)} />
        </div>
        {loading ? (
          <div className="loading"><div className="spinner"/>불러오는 중...</div>
        ) : (
          <div className="object-list">
            {filtered.map(obj => (
              <button key={obj.id}
                className={`object-item ${selected?.id === obj.id ? 'active' : ''}`}
                onClick={() => setSelected(obj)}>
                <div className="obj-item-row">
                  <span className="obj-label">{getLabel(obj, selectedType)}</span>
                  <span className="obj-status-dot" style={{ background: getStatusColor(obj, selectedType) }} />
                </div>
                <div className="obj-sub">{getSubLabel(obj, selectedType)}</div>
                <div className="obj-id">#{obj.id?.slice(0, 8)}</div>
              </button>
            ))}
            {!loading && filtered.length === 0 && (
              <div style={{ color:'var(--text3)', padding:'40px', textAlign:'center', fontSize:13 }}>데이터 없음</div>
            )}
          </div>
        )}
      </section>

      {/* ── 우측: Object Detail */}
      <section className="explorer-detail">
        {!selected ? (
          <div className="detail-empty">
            <div className="graph-header">
              <div className="graph-title">작전자원 네트워크</div>
              <div className="graph-subtitle">
                소방 운영의 모든 현실 객체가 하나의 살아있는 지식 그래프로 연결됩니다 — 노드를 클릭해 탐색하세요
              </div>
            </div>
            <div className="graph-wrap">
              <LiveOntologyGraph
                counts={counts}
                activeType={selectedType}
                onNodeClick={(key) => { setSelectedType(key); setSelected(null) }}
              />
            </div>
            <div className="graph-stats">
              {OBJECT_TYPES.map(t => (
                <div key={t.key} className="graph-stat-item"
                  style={{ borderColor: t.color + '44', background: t.color + '0d', cursor:'pointer' }}
                  onClick={() => setSelectedType(t.key)}>
                  <span className="graph-stat-icon">{t.icon}</span>
                  <span className="graph-stat-count" style={{ color: t.color }}>{counts[t.key] ?? '…'}</span>
                  <span className="graph-stat-label">{t.labelKr}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="object-detail">
            {/* ── 헤더 */}
            <div className="obj-detail-header" style={{ borderLeftColor: typeInfo.color }}>
              <div className="odh-top">
                <span className="odh-type-badge" style={{ background: typeInfo.color + '22', color: typeInfo.color }}>
                  {typeInfo.icon} {typeInfo.label}
                </span>
                <span className="odh-id">#{selected.id?.slice(0,8)}</span>
              </div>
              <div className="odh-name">{getLabel(selected, selectedType)}</div>
              <div className="odh-sub" style={{ color: getStatusColor(selected, selectedType) }}>
                {getSubLabel(selected, selectedType)}
              </div>
            </div>

            {/* ── Properties */}
            <div className="detail-section">
              <div className="detail-section-title">Properties</div>
              <div className="props-grid">
                {(SHOW_PROPS[selectedType] || []).map(key => {
                  const val = selected[key]
                  const display = fmt(val)
                  if (!display || display === 'null') return null
                  const label = PROP_LABELS[selectedType]?.[key] || key
                  return (
                    <div key={key} className="prop-row">
                      <span className="prop-label">{label}</span>
                      <span className="prop-value">{display}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* ── Linked Objects */}
            <div className="detail-section">
              <div className="detail-section-title">
                Linked Objects
                {relLoading && <span className="rel-loading">조회 중...</span>}
              </div>

              {relations && !relLoading && (
                <div className="rel-groups">

                  {/* INCIDENT 연결 관계 */}
                  {selectedType === 'incidents' && <>
                    {relations.building && (
                      <div className="rel-group">
                        <div className="rel-group-label">🏢 연결된 건물</div>
                        <RelCard
                          icon="🏢" title={relations.building.name}
                          sub={`${relations.building.building_type} · 지상${relations.building.floors_above}층`}
                          badge={relations.building.has_hazmat ? '☢ 위험물' : null}
                          badgeColor="#e84040"
                          onClick={() => jumpTo('buildings', relations.building)}
                        />
                      </div>
                    )}
                    {relations.commander && (
                      <div className="rel-group">
                        <div className="rel-group-label">👤 현장 지휘관</div>
                        <RelCard
                          icon="👤" title={`${relations.commander.rank} ${relations.commander.name}`}
                          sub={relations.commander.role}
                          onClick={() => jumpTo('personnel', relations.commander)}
                        />
                      </div>
                    )}
                    {relations.dispatches?.length > 0 && (
                      <div className="rel-group">
                        <div className="rel-group-label">🚒 출동 차량 ({relations.dispatches.length}대)</div>
                        <div className="rel-card-grid">
                          {relations.dispatches.map(d => (
                            <RelCard key={d.id}
                              icon="🚒" title={d.vehicles?.call_sign}
                              sub={d.role_at_scene || TYPE_KR[d.vehicles?.vehicle_type] || d.vehicles?.vehicle_type}
                              badge={STATUS_KR[d.vehicles?.status] || d.vehicles?.status}
                              badgeColor={d.vehicles?.status === 'onscene' ? '#e84040' : '#ffb300'}
                              onClick={() => d.vehicles && jumpTo('vehicles', d.vehicles)}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    {!relations.building && !relations.commander && relations.dispatches?.length === 0 && (
                      <div className="rel-empty">연결된 객체 없음</div>
                    )}
                  </>}

                  {/* VEHICLE 연결 관계 */}
                  {selectedType === 'vehicles' && <>
                    {relations.station && (
                      <div className="rel-group">
                        <div className="rel-group-label">🏠 소속 소방서</div>
                        <RelCard icon="🏠" title={relations.station.name}
                          sub={relations.station.short_name}
                          onClick={() => jumpTo('stations', relations.station)} />
                      </div>
                    )}
                    {relations.active_dispatch && (
                      <div className="rel-group">
                        <div className="rel-group-label">🚨 현재 출동 사고</div>
                        <RelCard icon="🚨"
                          title={relations.active_dispatch.incidents?.title}
                          sub={relations.active_dispatch.role_at_scene}
                          badge={STATUS_KR[relations.active_dispatch.incidents?.status]}
                          badgeColor="#e84040"
                          onClick={() => relations.active_dispatch.incidents && jumpTo('incidents', relations.active_dispatch.incidents)} />
                      </div>
                    )}
                    {!relations.station && !relations.active_dispatch && (
                      <div className="rel-empty">연결된 객체 없음</div>
                    )}
                  </>}

                  {/* PERSONNEL 연결 관계 */}
                  {selectedType === 'personnel' && <>
                    {relations.station && (
                      <div className="rel-group">
                        <div className="rel-group-label">🏠 소속 소방서</div>
                        <RelCard icon="🏠" title={relations.station.name}
                          sub={relations.station.short_name}
                          onClick={() => jumpTo('stations', relations.station)} />
                      </div>
                    )}
                    {relations.vehicle && (
                      <div className="rel-group">
                        <div className="rel-group-label">🚒 배속 차량</div>
                        <RelCard icon="🚒" title={relations.vehicle.call_sign}
                          sub={TYPE_KR[relations.vehicle.vehicle_type] || relations.vehicle.vehicle_type}
                          badge={STATUS_KR[relations.vehicle.status] || relations.vehicle.status}
                          badgeColor={relations.vehicle.status === 'onscene' ? '#e84040' : '#00e5a0'}
                          onClick={() => jumpTo('vehicles', relations.vehicle)} />
                      </div>
                    )}
                    {!relations.station && !relations.vehicle && (
                      <div className="rel-empty">연결된 객체 없음</div>
                    )}
                  </>}

                  {/* BUILDING 연결 관계 */}
                  {selectedType === 'buildings' && <>
                    {relations.incidents?.length > 0 ? (
                      <div className="rel-group">
                        <div className="rel-group-label">🚨 연관 사고 이력 ({relations.incidents.length}건)</div>
                        <div className="rel-card-grid">
                          {relations.incidents.map(inc => (
                            <RelCard key={inc.id} icon="🚨" title={inc.title}
                              sub={new Date(inc.reported_at).toLocaleDateString('ko-KR')}
                              badge={STATUS_KR[inc.status] || inc.status}
                              badgeColor={inc.status === 'closed' ? 'var(--text3)' : '#e84040'}
                              onClick={() => jumpTo('incidents', inc)} />
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="rel-empty">사고 이력 없음</div>
                    )}
                  </>}

                  {/* STATION 연결 관계 */}
                  {selectedType === 'stations' && <>
                    {relations.vehicles?.length > 0 && (
                      <div className="rel-group">
                        <div className="rel-group-label">🚒 보유 차량 ({relations.vehicles.length}대)</div>
                        <div className="rel-card-grid">
                          {relations.vehicles.map(v => (
                            <RelCard key={v.id} icon="🚒" title={v.call_sign}
                              sub={TYPE_KR[v.vehicle_type] || v.vehicle_type}
                              badge={STATUS_KR[v.status] || v.status}
                              badgeColor={v.status === 'onscene' ? '#e84040' : v.status === 'standby' ? '#00e5a0' : '#ffb300'}
                              onClick={() => jumpTo('vehicles', v)} />
                          ))}
                        </div>
                      </div>
                    )}
                    {relations.personnel?.length > 0 && (
                      <div className="rel-group">
                        <div className="rel-group-label">👤 소속 인원 ({relations.personnel.length}명)</div>
                        <div className="rel-card-grid">
                          {relations.personnel.map(p => (
                            <RelCard key={p.id} icon="👤"
                              title={`${p.rank} ${p.name}`}
                              badge={STATUS_KR[p.current_status] || p.current_status}
                              badgeColor={p.current_status === 'on_duty' ? '#00e5a0' : 'var(--text3)'}
                              onClick={() => jumpTo('personnel', p)} />
                          ))}
                        </div>
                      </div>
                    )}
                  </>}
                </div>
              )}
            </div>

            {/* ── Available Actions */}
            <div className="detail-section">
              <div className="detail-section-title">Available Actions</div>
              <div className="action-chips">
                {selectedType === 'incidents' && <>
                  <span className="action-chip">dispatchVehicle()</span>
                  <span className="action-chip">updateIncidentStatus()</span>
                  <span className="action-chip">closeIncident()</span>
                  <span className="action-chip">logAiCopilot()</span>
                </>}
                {selectedType === 'vehicles' && <>
                  <span className="action-chip">dispatchVehicle()</span>
                  <span className="action-chip">returnToStation()</span>
                </>}
                {(selectedType === 'personnel' || selectedType === 'stations' || selectedType === 'buildings') && <>
                  <span className="action-chip">view()</span>
                  <span className="action-chip">update()</span>
                </>}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
