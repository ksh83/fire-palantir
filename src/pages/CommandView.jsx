import { useState, useEffect } from 'react'
import BuildingBrief from '../components/BuildingBrief'
import RadioAgent from '../components/RadioAgent'
import CameraGrid from '../components/CameraGrid'
import { processRadioMessage, DEMO_SCENARIOS } from '../lib/radioAgent'
import './CommandView.css'

const STATUS_KR   = { pending:'접수', dispatched:'출동', onscene:'현장', controlled:'통제', closed:'종료' }
const STATUS_FLOW = ['pending','dispatched','onscene','controlled','closed']

const STAGE_COLOR = {
  '초기': 'var(--success)',
  '중기': 'var(--warn)',
  '성기': 'var(--danger)',
  '대형': '#ff0000',
  '미확인': 'var(--text3)',
}

const VEHICLE_TYPE_KR = {
  pump: '펌프', tank: '탱크', aerial: '고가', ladder: '굴절',
  rescue: '구조', amb: '구급', command: '지휘',
}

function ElapsedClock({ reportedAt }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const tick = () => setElapsed(Math.floor((Date.now() - new Date(reportedAt)) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [reportedAt])
  const h = Math.floor(elapsed / 3600)
  const m = Math.floor((elapsed % 3600) / 60)
  const s = elapsed % 60
  const str = h > 0
    ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
    : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
  return <span className={`elapsed-clock ${elapsed > 1800 ? 'elapsed-warn' : ''}`}>{str}</span>
}

function LiveClock() {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return <span className="live-clock">{time.toLocaleTimeString('ko-KR')}</span>
}

export default function CommandView({ incident, logs, dispatches, incidentId, onClose, isClosed, autoDemo = false, onRefresh }) {
  const [demoStep,    setDemoStep]    = useState(-1) // -1=대기, 0..4=진행 중, 5=완료
  const [demoRunning, setDemoRunning] = useState(false)
  const [demoError,   setDemoError]   = useState(null)

  useEffect(() => {
    if (!autoDemo) return
    let cancelled = false

    const DELAYS = [1500, 6500, 11500, 16500, 21500]

    setDemoRunning(true)
    setDemoStep(0)
    DEMO_SCENARIOS.forEach((scenario, i) => {
      setTimeout(async () => {
        if (cancelled) return
        setDemoStep(i)
        setDemoError(null)
        try {
          await processRadioMessage(incidentId, scenario.text, incident, scenario.mock)
          if (onRefresh) await onRefresh()
        } catch (e) {
          console.error('[AutoDemo] 시나리오', i + 1, '실패:', e.message)
          setDemoError(`시나리오 ${i + 1} 오류: ${e.message}`)
        }
        if (i === DEMO_SCENARIOS.length - 1) {
          setDemoStep(5)
          setDemoRunning(false)
        }
      }, DELAYS[i])
    })

    return () => { cancelled = true }
  }, [autoDemo, incidentId])
  const currentStepIdx = STATUS_FLOW.indexOf(incident.status)

  // 최근 radio_analysis 로그에서 AI 분석 추출
  const radioLogs    = logs.filter(l => l.action_type === 'radio_input').slice(-5).reverse()
  const lastAnalysis = [...logs].reverse().find(l => l.action_type === 'radio_analysis')
  const analysisData = lastAnalysis?.metadata?.analysis || null

  const onsceneVehicles = dispatches.filter(d =>
    d.vehicles?.status === 'onscene' || d.vehicles?.status === 'dispatched'
  )

  return (
    <div className="command-overlay">
      {/* ── 상단 지휘 헤더 */}
      <div className="cmd-header">
        <div className="cmd-header-left">
          <span className="cmd-incident-badge">
            <span className={`cmd-sev-dot sev-dot-${incident.severity}`} />
            {incident.incident_number}
          </span>
          <h1 className="cmd-title">{incident.title}</h1>
        </div>

        <div className="cmd-header-center">
          <div className="cmd-status-flow">
            {STATUS_FLOW.map((s, i) => (
              <span key={s} className={`cmd-step ${i <= currentStepIdx ? 'done' : ''} ${i === currentStepIdx ? 'current' : ''}`}>
                {STATUS_KR[s]}
                {i < STATUS_FLOW.length - 1 && <span className="cmd-step-arrow">›</span>}
              </span>
            ))}
          </div>
        </div>

        <div className="cmd-header-right">
          {autoDemo && (
            <div className="demo-indicator">
              {demoStep === -1
                ? <><span className="demo-dot" />데모 준비 중...</>
                : demoStep < 5
                ? <><span className="demo-dot" />시나리오 {demoStep + 1}/5 재생 중</>
                : <><span className="demo-dot demo-done" />데모 완료</>}
            </div>
          )}
          {demoError && (
            <div style={{ fontSize: 11, color: 'var(--danger)', maxWidth: 200, textAlign: 'right' }}>
              ⚠ {demoError}
            </div>
          )}
          <div className="cmd-clocks">
            <div className="cmd-clock-item">
              <span className="cmd-clock-label">경과</span>
              <ElapsedClock reportedAt={incident.reported_at} />
            </div>
            <div className="cmd-clock-item">
              <span className="cmd-clock-label">현재</span>
              <LiveClock />
            </div>
          </div>
          <button className="btn btn-ghost cmd-close-btn" onClick={onClose}>
            ✕ 지휘 모드 종료
          </button>
        </div>
      </div>

      {/* ── 3-패널 본문 */}
      <div className="cmd-body">

        {/* ── 패널 1: 건물 온톨로지 */}
        <div className="cmd-panel cmd-panel-left">
          <div className="cmd-panel-header">
            <span className="cmd-panel-title">🏢 건물 정보</span>
            <span className="cmd-panel-subtitle">사전 조사 · 전술 브리핑</span>
          </div>
          <div className="cmd-panel-scroll">
            {incident.buildings
              ? <BuildingBrief building={incident.buildings} incidentType={incident.incident_type} />
              : <div className="cmd-no-data">연결된 건물 정보 없음</div>
            }

            {/* 사고 요약 카드 */}
            <div className="card cmd-summary-card">
              <div className="card-header">
                <span className="card-title">현장 현황</span>
              </div>
              <div className="cmd-summary-grid">
                <div className="cmd-summary-item">
                  <div className="cmd-summary-label">화재 단계</div>
                  <div className="cmd-summary-value" style={{ color: STAGE_COLOR[incident.fire_stage] || STAGE_COLOR['미확인'], fontSize: 22, fontWeight: 800 }}>
                    {incident.fire_stage || '미확인'}
                  </div>
                </div>
                <div className="cmd-summary-item">
                  <div className="cmd-summary-label">진입 인원 (PAR)</div>
                  <div className="cmd-summary-value" style={{ color: incident.par_count > 0 ? 'var(--info)' : 'var(--text3)', fontSize: 22, fontWeight: 800 }}>
                    {incident.par_count > 0 ? `🧑‍🚒 ${incident.par_count}명` : '—'}
                  </div>
                </div>
                <div className="cmd-summary-item">
                  <div className="cmd-summary-label">위험도</div>
                  <div className={`cmd-summary-value sev-${incident.severity}`} style={{ fontSize: 18, fontWeight: 800 }}>
                    {'★'.repeat(incident.severity)} {incident.severity}/5
                  </div>
                </div>
                <div className="cmd-summary-item">
                  <div className="cmd-summary-label">위험물</div>
                  <div className="cmd-summary-value" style={{ color: incident.hazmat_risk ? 'var(--danger)' : 'var(--text3)' }}>
                    {incident.hazmat_risk ? '☢ 위험물 있음' : '없음'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── 패널 2: 무전 · 실시간 현황 */}
        <div className="cmd-panel cmd-panel-center">
          <div className="cmd-panel-header">
            <span className="cmd-panel-title">📡 무전 · 현황</span>
            <span className="cmd-panel-subtitle">실시간 무전 수신 및 상태 갱신</span>
          </div>
          <div className="cmd-panel-scroll">
            {/* 차량 카메라 현황 */}
            <CameraGrid dispatches={dispatches} />

            {!isClosed && (
              <RadioAgent incidentId={incidentId} incident={incident} />
            )}

            {/* 무전 수신 이력 */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">📡 무전 수신 이력</span>
                <span className="section-count">{radioLogs.length}건</span>
              </div>
              <div className="cmd-radio-log-list">
                {radioLogs.length === 0 && (
                  <div className="cmd-no-data">무전 수신 기록 없음</div>
                )}
                {radioLogs.map(log => (
                  <div key={log.id} className="cmd-radio-log-item">
                    <span className="cmd-radio-time">
                      {new Date(log.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    <span className="cmd-radio-text">{log.content}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── 패널 3: 전술 권고 */}
        <div className="cmd-panel cmd-panel-right">
          <div className="cmd-panel-header">
            <span className="cmd-panel-title">🤖 AI 전술 권고</span>
            <span className="cmd-panel-subtitle">무전 분석 기반 실시간 권고</span>
          </div>
          <div className="cmd-panel-scroll">

            {/* 투입 차량 현황 */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">투입 차량</span>
                <span className="section-count">{onsceneVehicles.length}대</span>
              </div>
              <div className="cmd-vehicle-list">
                {onsceneVehicles.length === 0 && (
                  <div className="cmd-no-data">출동 차량 없음</div>
                )}
                {onsceneVehicles.map(d => (
                  <div key={d.id} className="cmd-vehicle-item">
                    <div className="cmd-vehicle-type">
                      {VEHICLE_TYPE_KR[d.vehicles?.vehicle_type] || d.vehicles?.vehicle_type}
                    </div>
                    <div className="cmd-vehicle-callsign">{d.vehicles?.call_sign}</div>
                    <span className={`status-badge status-${d.vehicles?.status}`}>
                      {d.vehicles?.status === 'onscene' ? '현장' : '출동중'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 최신 AI 분석 */}
            {analysisData ? (
              <div className="card cmd-ai-card">
                <div className="card-header">
                  <span className="card-title">
                    <span className="ai-tag" style={{marginRight:6}}>AI</span>
                    최신 무전 분석
                  </span>
                  <span className="cmd-analysis-time">
                    {new Date(lastAnalysis.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                <div className="cmd-ai-stage" style={{ color: STAGE_COLOR[analysisData.fire_stage] || 'var(--text3)' }}>
                  화재단계 {analysisData.fire_stage}
                </div>

                {analysisData.hazards?.length > 0 && (
                  <div className="cmd-ai-section">
                    <div className="cmd-ai-label">⚠️ 위험요소</div>
                    <div className="tag-list">
                      {analysisData.hazards.map((h, i) => (
                        <span key={i} className="tag tag-danger">{h}</span>
                      ))}
                    </div>
                  </div>
                )}

                {analysisData.resource_requests?.length > 0 && (
                  <div className="cmd-ai-section">
                    <div className="cmd-ai-label">📋 자원 요청</div>
                    <div className="tag-list">
                      {analysisData.resource_requests.map((r, i) => (
                        <span key={i} className="tag tag-info">{r}</span>
                      ))}
                    </div>
                  </div>
                )}

                {analysisData.immediate_actions?.length > 0 && (
                  <div className="cmd-ai-section">
                    <div className="cmd-ai-label">⚡ 즉각 조치</div>
                    <ul className="cmd-action-list">
                      {analysisData.immediate_actions.map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="cmd-ai-summary">{analysisData.summary}</div>
              </div>
            ) : (
              <div className="card cmd-ai-empty">
                <div className="cmd-no-data">
                  무전 에이전트를 통해 분석을 시작하면<br />여기에 AI 전술 권고가 표시됩니다.
                </div>
              </div>
            )}

            {/* 모든 전술 로그 (radio 제외) */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">전술 로그</span>
              </div>
              <div className="cmd-log-list">
                {logs.filter(l => l.action_type !== 'radio_input' && l.action_type !== 'radio_analysis').slice(-8).reverse().map(log => (
                  <div key={log.id} className={`cmd-log-item ${log.ai_assisted ? 'ai-log' : ''}`}>
                    <span className="cmd-log-time">
                      {new Date(log.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="cmd-log-content">{log.content}</span>
                  </div>
                ))}
                {logs.filter(l => l.action_type !== 'radio_input' && l.action_type !== 'radio_analysis').length === 0 && (
                  <div className="cmd-no-data">로그 없음</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
