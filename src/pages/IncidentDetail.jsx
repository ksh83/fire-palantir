import { useState, useEffect } from 'react'
import { getIncidentWithLogs, getStandbyVehicles, dispatchVehicle, updateIncidentStatus, closeIncident, supabase } from '../lib/supabase'
import AiCopilot from '../components/AiCopilot'
import RadioAgent from '../components/RadioAgent'
import BuildingBrief from '../components/BuildingBrief'
import CommandView from './CommandView'
import './IncidentDetail.css'

const STATUS_FLOW = ['pending','dispatched','onscene','controlled','closed']
const STATUS_KR = { pending:'접수', dispatched:'출동', onscene:'현장', controlled:'통제', closed:'종료' }
const ACTION_KR = {
  dispatch_vehicle: '출동 명령',
  update_status:    '상황 업데이트',
  close_incident:   '사고 종료',
  ai_copilot_query: 'AI 코파일럿',
  manual_entry:     '수기 기록',
  resource_request: '자원 요청',
  radio_input:      '📡 무전 수신',
  radio_analysis:   '🤖 무전 분석',
}

// 테스트용 고정 지휘관 ID (실제 운영 시 인증 연동 필요)
const DEMO_COMMANDER_ID = '30000000-0000-0000-0000-000000000001'

export default function IncidentDetail({ incidentId, onBack, autoDemo = false }) {
  const [data,           setData]          = useState(null)
  const [standbyVehicles,setStandbyVehicles]= useState([])
  const [loading,        setLoading]       = useState(true)
  const [error,          setError]         = useState(null)
  const [dispatching,    setDispatching]   = useState(false)
  const [selectedVehicle,setSelectedVehicle]= useState('')
  const [statusNote,     setStatusNote]    = useState('')
  const [showAi,         setShowAi]        = useState(false)
  const [commandMode,    setCommandMode]   = useState(autoDemo)

  async function load() {
    try {
      const [detail, sveh] = await Promise.all([
        getIncidentWithLogs(incidentId),
        getStandbyVehicles(),
      ])
      setData(detail)
      setStandbyVehicles(sveh || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const ch = supabase
      .channel(`incident-${incidentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tactical_logs',
          filter: `incident_id=eq.${incidentId}` }, load)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'incidents',
          filter: `id=eq.${incidentId}` }, load)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [incidentId])

  async function handleDispatch() {
    if (!selectedVehicle) return
    setDispatching(true)
    try {
      const result = await dispatchVehicle(selectedVehicle, incidentId, DEMO_COMMANDER_ID, null)
      if (!result.ok) { setError(result.error); return }
      setSelectedVehicle('')
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setDispatching(false)
    }
  }

  async function handleStatusUpdate(newStatus) {
    const note = statusNote || `${STATUS_KR[newStatus]} 상태로 업데이트`
    try {
      await updateIncidentStatus(incidentId, newStatus, note, DEMO_COMMANDER_ID)
      setStatusNote('')
      await load()
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleClose() {
    if (!confirm('사고를 종료하시겠습니까?')) return
    try {
      await closeIncident(incidentId, DEMO_COMMANDER_ID, '사고 처리 완료', { injured:0, deceased:0, rescued:0 })
      await load()
    } catch (e) {
      setError(e.message)
    }
  }

  if (loading) return <div className="loading"><div className="spinner"/>불러오는 중...</div>
  if (!data) return <div className="error-msg">사고 정보를 불러올 수 없습니다</div>

  const { incident, logs, dispatches } = data
  const currentStepIdx = STATUS_FLOW.indexOf(incident.status)
  const isClosed = incident.status === 'closed'

  if (commandMode) {
    return (
      <CommandView
        incident={incident}
        logs={logs}
        dispatches={dispatches}
        incidentId={incidentId}
        isClosed={isClosed}
        autoDemo={autoDemo}
        onClose={() => setCommandMode(false)}
        onRefresh={load}
      />
    )
  }

  return (
    <div className="incident-detail">
      {/* ── 상단 헤더 */}
      <div className="detail-header">
        <button className="btn btn-ghost" onClick={onBack}>← 대시보드</button>
        <div className="detail-title-wrap">
          <h1 className="detail-title">{incident.title}</h1>
          <span className="incident-num">{incident.incident_number}</span>
        </div>
        <div style={{display:'flex', gap:8}}>
          {!isClosed && (
            <button className="btn btn-primary" onClick={() => setCommandMode(true)}
              style={{background:'linear-gradient(135deg, #e84040, #ff6b35)', border:'none'}}>
              ⚡ 현장지휘 모드
            </button>
          )}
          <button className="btn btn-ai" onClick={() => setShowAi(!showAi)}>
            🤖 AI 코파일럿
          </button>
        </div>
      </div>

      {error && <div className="error-msg">{error}</div>}

      {/* ── 상태 타임라인 */}
      <div className="card status-timeline">
        {STATUS_FLOW.map((s, i) => (
          <div key={s} className={`timeline-step ${i <= currentStepIdx ? 'done' : ''} ${i === currentStepIdx ? 'current' : ''}`}>
            <div className="step-dot" />
            <div className="step-label">{STATUS_KR[s]}</div>
            {i < STATUS_FLOW.length - 1 && <div className="step-line" />}
          </div>
        ))}
      </div>

      <div className="detail-body">
        {/* ── 좌측: 사고 정보 + 출동 차량 */}
        <div className="detail-left">
          {/* 건물 온톨로지 브리핑 */}
          <BuildingBrief building={incident.buildings} incidentType={incident.incident_type} />

          {/* 사고 정보 */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">사고 정보</span>
            </div>
            <dl className="info-list">
              <dt>위치</dt><dd>{incident.address}</dd>
              <dt>유형</dt><dd>{incident.incident_type}</dd>
              <dt>위험도</dt><dd className={`sev-${incident.severity}`}>{'★'.repeat(incident.severity)} (위험도 {incident.severity})</dd>
              <dt>접수</dt><dd>{new Date(incident.reported_at).toLocaleString('ko-KR')}</dd>
              {incident.dispatched_at && <><dt>출동</dt><dd>{new Date(incident.dispatched_at).toLocaleString('ko-KR')}</dd></>}
              {incident.arrived_at   && <><dt>도착</dt><dd>{new Date(incident.arrived_at).toLocaleString('ko-KR')}</dd></>}
              {incident.commander_name && <><dt>지휘관</dt><dd>{incident.commander_rank} {incident.commander_name}</dd></>}
              {incident.fire_stage && incident.fire_stage !== '미확인' && (
                <><dt>화재단계</dt><dd style={{color: incident.fire_stage === '대형' || incident.fire_stage === '성기' ? 'var(--danger)' : incident.fire_stage === '중기' ? 'var(--warn)' : 'var(--success)', fontWeight:700}}>{incident.fire_stage}</dd></>
              )}
              {incident.par_count > 0 && (
                <><dt>진입인원</dt><dd style={{color:'var(--info)', fontWeight:700}}>🧑‍🚒 {incident.par_count}명 내부</dd></>
              )}
              {incident.hazmat_risk && (
                <><dt>위험물</dt><dd style={{color:'var(--danger)', fontWeight:700}}>☢ 위험물 확인</dd></>
              )}
            </dl>
            {incident.initial_report && (
              <div className="initial-report">
                <div style={{color:'var(--text3)', fontSize:11, marginBottom:4}}>초기 보고</div>
                {incident.initial_report}
              </div>
            )}
          </div>

          {/* 출동 차량 */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">투입 차량</span>
              <span className="section-count">{dispatches.length}대</span>
            </div>
            <div className="dispatch-list">
              {dispatches.map(d => (
                <div key={d.id} className="dispatch-item">
                  <span className="dispatch-callsign">{d.vehicles?.call_sign}</span>
                  <span className="dispatch-role">{d.role_at_scene || '-'}</span>
                  <span className={`status-badge status-${d.vehicles?.status}`}>
                    {d.vehicles?.status === 'onscene' ? '현장' :
                     d.vehicles?.status === 'dispatched' ? '출동중' :
                     d.vehicles?.status === 'returning' ? '귀소중' : d.vehicles?.status}
                  </span>
                </div>
              ))}
              {dispatches.length === 0 && (
                <div style={{color:'var(--text3)', fontSize:12}}>출동 차량 없음</div>
              )}
            </div>
          </div>

          {/* 출동 명령 — Action Type */}
          {!isClosed && (
            <div className="card action-card">
              <div className="card-header">
                <span className="card-title">출동 명령</span>
              </div>
              <div className="dispatch-form">
                <select
                  value={selectedVehicle}
                  onChange={e => setSelectedVehicle(e.target.value)}
                  className="select"
                >
                  <option value="">대기 차량 선택...</option>
                  {standbyVehicles.map(v => (
                    <option key={v.id} value={v.id}>
                      {v.call_sign} ({v.stations?.short_name})
                    </option>
                  ))}
                </select>
                <button
                  className="btn btn-primary"
                  onClick={handleDispatch}
                  disabled={!selectedVehicle || dispatching}
                >
                  {dispatching ? '처리 중...' : '출동 명령'}
                </button>
              </div>
            </div>
          )}

          {/* 무전 에이전트 */}
          {!isClosed && (
            <RadioAgent incidentId={incidentId} incident={incident} />
          )}

          {/* 상황 업데이트 — Action Type */}
          {!isClosed && (
            <div className="card action-card">
              <div className="card-header">
                <span className="card-title">상황 업데이트</span>
              </div>
              <input
                className="input"
                placeholder="상황 메모 입력..."
                value={statusNote}
                onChange={e => setStatusNote(e.target.value)}
              />
              <div className="status-btns">
                {STATUS_FLOW.filter(s => STATUS_FLOW.indexOf(s) > currentStepIdx && s !== 'closed').map(s => (
                  <button key={s} className="btn btn-ghost" onClick={() => handleStatusUpdate(s)}>
                    → {STATUS_KR[s]}
                  </button>
                ))}
                <button className="btn" style={{background:'var(--text3)', color:'#fff'}} onClick={handleClose}>
                  사고 종료
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── 우측: AI 코파일럿 + 전술 로그 */}
        <div className="detail-right">
          {showAi && (
            <AiCopilot
              incident={incident}
              dispatches={dispatches}
              onClose={() => setShowAi(false)}
            />
          )}

          {/* 전술 로그 — TacticalLog */}
          <div className="card log-card">
            <div className="card-header">
              <span className="card-title">전술 로그</span>
              <span className="section-count">{logs.length}건</span>
            </div>
            <div className="log-list">
              {logs.map(log => (
                <div key={log.id} className={`log-item ${log.ai_assisted ? 'ai-log' : ''} ${log.action_type === 'radio_input' ? 'radio-log' : ''} ${log.action_type === 'radio_analysis' ? 'radio-analysis-log' : ''}`}>
                  <div className="log-time">
                    {new Date(log.created_at).toLocaleTimeString('ko-KR', {hour:'2-digit',minute:'2-digit'})}
                  </div>
                  <div className="log-body">
                    <div className="log-action-type">
                      {log.ai_assisted && <span className="ai-tag">AI</span>}
                      {ACTION_KR[log.action_type] || log.action_type}
                      {log.personnel && (
                        <span className="log-actor"> · {log.personnel.rank} {log.personnel.name}</span>
                      )}
                    </div>
                    <div className="log-content">{log.content}</div>
                  </div>
                </div>
              ))}
              {logs.length === 0 && (
                <div style={{color:'var(--text3)', fontSize:12}}>로그 없음</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
