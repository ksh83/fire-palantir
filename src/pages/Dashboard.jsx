import { useState, useEffect } from 'react'
import { getActiveIncidents, getStationResources, getAllVehicles, supabase } from '../lib/supabase'
import NewIncidentModal from '../components/NewIncidentModal'
import './Dashboard.css'

const INCIDENT_TYPE_LABEL = { fire:'화재', rescue:'구조', ems:'구급', hazmat:'화학', flood:'수해', other:'기타' }
const VEHICLE_TYPE_LABEL  = { pump:'펌프', tank:'탱크', ladder:'굴절', aerial:'고가', amb:'구급', command:'지휘', rescue:'구조' }

const STAGE_COLOR = { '초기':'var(--success)', '중기':'var(--warn)', '성기':'var(--danger)', '대형':'#ff0000' }
const DEMO_INCIDENT_ID = '90000000-0000-0000-0000-000000000001'

const STATUS_KR = {
  standby:'대기', dispatched:'출동중', onscene:'현장', returning:'귀소', maintenance:'정비',
  pending:'접수', controlled:'통제', closed:'종료',
}

function ElapsedTime({ from }) {
  const [elapsed, setElapsed] = useState('')
  useEffect(() => {
    function update() {
      const ms = Date.now() - new Date(from).getTime()
      const m = Math.floor(ms / 60000)
      const h = Math.floor(m / 60)
      setElapsed(h > 0 ? `${h}시간 ${m % 60}분` : `${m}분`)
    }
    update()
    const id = setInterval(update, 30000)
    return () => clearInterval(id)
  }, [from])
  return <span>{elapsed}</span>
}

export default function Dashboard({ onSelectIncident, onDemoLaunch }) {
  const [incidents,    setIncidents]    = useState([])
  const [stations,     setStations]     = useState([])
  const [vehicles,     setVehicles]     = useState([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState(null)
  const [showNewModal, setShowNewModal] = useState(false)

  const isConfigured = !!import.meta.env.VITE_SUPABASE_URL

  async function load() {
    if (!isConfigured) { setLoading(false); return }
    try {
      const [inc, sta, veh] = await Promise.all([
        getActiveIncidents(),
        getStationResources(),
        getAllVehicles(),
      ])
      setIncidents(inc || [])
      setStations(sta  || [])
      setVehicles(veh  || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    if (!isConfigured) return

    // Supabase Realtime 구독
    const ch = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles' }, load)
      .subscribe()

    return () => supabase.removeChannel(ch)
  }, [])

  const totalStandby    = vehicles.filter(v => v.status === 'standby').length
  const totalDispatched = vehicles.filter(v => v.status !== 'standby' && v.status !== 'maintenance').length
  const hazmatCount     = incidents.filter(i => i.hazmat_risk).length
  const totalPAR        = incidents.reduce((s, i) => s + (i.par_count || 0), 0)

  if (loading) return <div className="loading"><div className="spinner"/>데이터 로딩 중...</div>

  return (
    <div className="dashboard">
      {!isConfigured && (
        <div className="setup-banner">
          <h3>Supabase 연결 설정 필요</h3>
          <p>아래 파일을 생성하고 API 키를 입력하세요:</p>
          <code>
            VITE_SUPABASE_URL=https://your-project.supabase.co{'\n'}
            VITE_SUPABASE_ANON_KEY=your-anon-key
          </code>
          <p style={{marginTop:12, color:'var(--text2)', fontSize:12}}>
            Supabase 프로젝트 생성 후 supabase/migrations/001_ontology_core.sql 실행 →
            supabase/seeds/001_deokjin_seed.sql 실행
          </p>
        </div>
      )}

      {error && <div className="error-msg">오류: {error}</div>}

      {/* ── 데모 실행 배너 */}
      {isConfigured && onDemoLaunch && (
        <div className="demo-banner" onClick={onDemoLaunch}>
          <div className="demo-banner-left">
            <span className="demo-banner-icon">🎬</span>
            <div>
              <div className="demo-banner-title">자동 데모 실행</div>
              <div className="demo-banner-desc">전주덕진물류센터 화재 · 5단계 무전 에이전트 자동 재현 · 현장지휘 모드 자동 진입</div>
            </div>
          </div>
          <span className="demo-banner-btn">▶ 데모 시작</span>
        </div>
      )}

      {/* ── KPI 요약 */}
      <div className="kpi-row">
        <div className="kpi-card">
          <div className="kpi-value accent">{incidents.length}</div>
          <div className="kpi-label">활성 사고</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value warn">{totalDispatched}</div>
          <div className="kpi-label">출동 차량</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value success">{totalStandby}</div>
          <div className="kpi-label">대기 차량</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value info">{stations.length}</div>
          <div className="kpi-label">관할 소방서</div>
        </div>
        {hazmatCount > 0 && (
          <div className="kpi-card kpi-danger">
            <div className="kpi-value" style={{color:'var(--danger)'}}>☢ {hazmatCount}</div>
            <div className="kpi-label">위험물 사고</div>
          </div>
        )}
        {totalPAR > 0 && (
          <div className="kpi-card kpi-info">
            <div className="kpi-value" style={{color:'var(--info)'}}>{totalPAR}명</div>
            <div className="kpi-label">건물 내 대원</div>
          </div>
        )}
      </div>

      <div className="dashboard-body">
        {/* ── 활성 사고 목록 */}
        <section>
          <div className="section-header">
            <h2 className="section-title">활성 사고</h2>
            <span className="section-count">{incidents.length}건</span>
            {isConfigured && (
              <button className="btn btn-primary" style={{ marginLeft: 'auto', fontSize: 12, padding: '5px 12px' }}
                onClick={() => setShowNewModal(true)}>
                + 신규 접수
              </button>
            )}
          </div>

          {incidents.length === 0 ? (
            <div className="card" style={{textAlign:'center', color:'var(--text3)', padding:'40px'}}>
              현재 활성 사고 없음
            </div>
          ) : (
            <div className="incident-list">
              {incidents.map(inc => (
                <button
                  key={inc.id}
                  className="incident-card"
                  onClick={() => onSelectIncident(inc.id)}
                >
                  <div className="incident-top">
                    <span className={`badge badge-${inc.incident_type}`}>
                      {INCIDENT_TYPE_LABEL[inc.incident_type] || inc.incident_type}
                    </span>
                    <span className={`sev-${inc.severity}`}>
                      {'★'.repeat(inc.severity)} 위험도 {inc.severity}
                    </span>
                    <span className={`status-badge status-${inc.status}`}>
                      {STATUS_KR[inc.status]}
                    </span>
                    <span className="elapsed-time">
                      <ElapsedTime from={inc.reported_at} /> 경과
                    </span>
                  </div>
                  <div className="incident-title">{inc.title}</div>
                  <div className="incident-meta">
                    <span>📍 {inc.address}</span>
                    {inc.commander_name && (
                      <span>👤 {inc.commander_rank} {inc.commander_name}</span>
                    )}
                    <span>🚒 투입 {inc.vehicle_count}대</span>
                  </div>
                  {(inc.fire_stage || inc.hazmat_risk || inc.par_count > 0) && (
                    <div className="incident-live-badges">
                      {inc.fire_stage && inc.fire_stage !== '미확인' && (
                        <span className="live-badge" style={{color: STAGE_COLOR[inc.fire_stage] || 'var(--text3)', borderColor: STAGE_COLOR[inc.fire_stage] || 'var(--border)'}}>
                          🔥 {inc.fire_stage}
                        </span>
                      )}
                      {inc.hazmat_risk && (
                        <span className="live-badge live-badge-danger">☢ 위험물</span>
                      )}
                      {inc.par_count > 0 && (
                        <span className="live-badge live-badge-info">🧑‍🚒 내부 {inc.par_count}명</span>
                      )}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* ── 소방서별 자원 현황 */}
        <section>
          <div className="section-header">
            <h2 className="section-title">소방서별 자원 현황</h2>
          </div>
          <div className="station-grid">
            {stations.map(st => (
              <div key={st.id} className="station-card card">
                <div className="station-name">{st.name}</div>
                <div className="station-district">{st.district}</div>
                <div className="resource-bars">
                  <div className="resource-row">
                    <span className="resource-label">대기</span>
                    <div className="resource-bar">
                      <div
                        className="bar-fill success"
                        style={{width: `${(st.vehicles_standby / Math.max(st.vehicles_total,1))*100}%`}}
                      />
                    </div>
                    <span className="resource-num">{st.vehicles_standby}</span>
                  </div>
                  <div className="resource-row">
                    <span className="resource-label">출동</span>
                    <div className="resource-bar">
                      <div
                        className="bar-fill warn"
                        style={{width: `${((st.vehicles_dispatched+st.vehicles_onscene) / Math.max(st.vehicles_total,1))*100}%`}}
                      />
                    </div>
                    <span className="resource-num">{st.vehicles_dispatched + st.vehicles_onscene}</span>
                  </div>
                </div>
                <div className="station-footer">
                  차량 총 {st.vehicles_total}대 · 근무 {st.personnel_on_duty}명
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── 전체 차량 현황 */}
        <section>
          <div className="section-header">
            <h2 className="section-title">전체 차량 현황</h2>
          </div>
          <div className="vehicle-table-wrap card">
            <table className="vehicle-table">
              <thead>
                <tr>
                  <th>콜사인</th>
                  <th>차종</th>
                  <th>소속</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map(v => (
                  <tr key={v.id}>
                    <td className="callsign">{v.call_sign}</td>
                    <td>{VEHICLE_TYPE_LABEL[v.vehicle_type] || v.vehicle_type}</td>
                    <td>{v.stations?.short_name || '-'}</td>
                    <td>
                      <span className={`status-badge status-${v.status}`}>
                        {STATUS_KR[v.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {showNewModal && (
        <NewIncidentModal
          onClose={() => setShowNewModal(false)}
          onCreated={(id) => { setShowNewModal(false); onSelectIncident(id) }}
        />
      )}
    </div>
  )
}
