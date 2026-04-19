import { useState, useEffect } from 'react'
import { supabase, dispatchVehicle, updateIncidentStatus, closeIncident } from '../lib/supabase'
import './Simulation.css'

const IDS = {
  commander: '30000000-0000-0000-0000-000000000001',
  vehicles: {
    dj_cmd1:   '20000000-0000-0000-0000-000000000001',
    dj_pump1:  '20000000-0000-0000-0000-000000000002',
    dj_tank1:  '20000000-0000-0000-0000-000000000003',
    dj_aerial: '20000000-0000-0000-0000-000000000004',
    dj_rescue: '20000000-0000-0000-0000-000000000005',
    dj_amb1:   '20000000-0000-0000-0000-000000000006',
    ga_pump1:  '20000000-0000-0000-0000-000000000011',
    ga_ladder: '20000000-0000-0000-0000-000000000013',
  },
}

const SCENARIOS = [
  {
    id: 'highrise_fire',
    title: '고층 아파트 화재',
    icon: '🏢',
    badge: '화재',
    badgeClass: 'badge-fire',
    severity: 4,
    incident_type: 'fire',
    address: '전북 전주시 덕진구 인후동 1가 123 코오롱하늘채 15층',
    lat: 35.8510, lon: 127.1200,
    initial_report: '15층 주거 세대에서 화재 발생. 연기 다량 발생. 요구조자 가족 3명 미탈출 확인.',
    knowledge_preview: '고층 피난 동선 확보 전술 · 고가차 접근 각도 · PAR 관리 절차',
    steps: [
      { label: '1차 출동 — 펌프·지휘차', vehicles: ['dj_cmd1', 'dj_pump1'], roles: ['지휘', '주수'], status: null },
      { label: '고가차 추가 출동', vehicles: ['dj_aerial'], roles: ['고가진입'], status: 'onscene' },
      { label: '탱크·구급차 추가', vehicles: ['dj_tank1', 'dj_amb1'], roles: ['급수지원', '구급'], status: null },
      { label: '금암 지원 출동', vehicles: ['ga_pump1', 'ga_ladder'], roles: ['2선주수', '굴절지원'], status: 'controlled' },
      { label: '사고 종료 + 지식 추출', vehicles: [], roles: [], status: 'close', report: '15층 화재 완전 진화. 요구조자 3명 구조 완료. 사망 0명 부상 2명.' },
    ],
  },
  {
    id: 'traffic_rescue',
    title: '교통사고 구조',
    icon: '🚗',
    badge: '구조',
    badgeClass: 'badge-rescue',
    severity: 3,
    incident_type: 'rescue',
    address: '전북 전주시 덕진구 금암사거리 교차로',
    lat: 35.8415, lon: 127.1060,
    initial_report: '대형 교통사고. 승용차 2대 정면충돌. 요구조자 4명 차량 내 갇힘. 1명 의식 불명.',
    knowledge_preview: '정면충돌 구조 순서 · 화재 예방 경계 배치 · 다수 사상자 분류',
    steps: [
      { label: '구조·구급 1차 출동', vehicles: ['dj_rescue', 'dj_amb1'], roles: ['구조', '구급'], status: null },
      { label: '현장 도착 — 구조 개시', vehicles: [], roles: [], status: 'onscene' },
      { label: '펌프차 지원 (화재 예방)', vehicles: ['dj_pump1'], roles: ['화재경계'], status: null },
      { label: '구조 완료 — 통제 단계', vehicles: [], roles: [], status: 'controlled' },
      { label: '사고 종료 + 지식 추출', vehicles: [], roles: [], status: 'close', report: '요구조자 4명 전원 구조. 중상 1명·경상 3명. 화재 없음.' },
    ],
  },
  {
    id: 'hazmat',
    title: '화학물질 누출',
    icon: '⚗️',
    badge: '화학',
    badgeClass: 'badge-hazmat',
    severity: 4,
    incident_type: 'hazmat',
    address: '전북 전주시 덕진구 팔복동 팔복산업단지 화학공장',
    lat: 35.8760, lon: 127.1380,
    initial_report: '화학공장 배관 파열로 염소계 가스 누출. 인근 주민 대피 필요. 작업자 2명 흡입 피해.',
    knowledge_preview: '화학 누출 방호복 착용 절차 · 주민 대피 반경 기준 · 제염 지원 배치',
    steps: [
      { label: '화학구조대 출동', vehicles: ['dj_rescue', 'dj_cmd1'], roles: ['화학구조', '지휘'], status: null },
      { label: '구급차 동시 출동', vehicles: ['dj_amb1'], roles: ['구급'], status: null },
      { label: '현장 접근 — 방호복 착용', vehicles: [], roles: [], status: 'onscene' },
      { label: '누출 차단 완료', vehicles: ['dj_pump1'], roles: ['제염지원'], status: 'controlled' },
      { label: '사고 종료 + 지식 추출', vehicles: [], roles: [], status: 'close', report: '염소 가스 누출 차단 완료. 흡입 부상자 2명 병원 이송. 주민 대피 해제.' },
    ],
  },
]

const PIPELINE_STAGES = ['사고 접수', '차량 출동', '현장 지휘', '사고 종료', 'AI 지식 추출', 'FIRE.BRAIN']

function delay(ms) { return new Promise(r => setTimeout(r, ms)) }

export default function Simulation({ onSelectIncident, onNavigate }) {
  const [running,       setRunning]       = useState(null)
  const [stepIdx,       setStepIdx]       = useState(0)
  const [logs,          setLogs]          = useState([])
  const [incidentIds,   setIncidentIds]   = useState([])
  const [done,          setDone]          = useState(false)
  const [error,         setError]         = useState(null)
  const [pipelineStage, setPipelineStage] = useState(-1)
  const [knowledgeBefore, setKnowledgeBefore] = useState(null)
  const [knowledgeAfter,  setKnowledgeAfter]  = useState(null)
  const [runningAll,    setRunningAll]    = useState(false)
  const [currentScenarioIdx, setCurrentScenarioIdx] = useState(-1)

  const isConfigured = !!import.meta.env.VITE_SUPABASE_URL

  useEffect(() => {
    if (isConfigured) fetchKnowledgeCount().then(n => setKnowledgeBefore(n))
  }, [])

  async function fetchKnowledgeCount() {
    const { count } = await supabase.from('knowledge_items').select('*', { count: 'exact', head: true })
    return count || 0
  }

  function addLog(text, type = 'info') {
    setLogs(prev => [...prev, { text, type, time: new Date().toLocaleTimeString('ko-KR') }])
  }

  async function runScenario(scenario, isPartOfAll = false) {
    if (!isConfigured) { setError('Supabase 연결 후 실행할 수 있습니다.'); return null }
    if (!isPartOfAll) {
      setRunning(scenario.id)
      setStepIdx(0)
      setLogs([])
      setIncidentIds([])
      setDone(false)
      setError(null)
      setPipelineStage(0)
    }

    try {
      setPipelineStage(0)
      addLog(`▶ ${scenario.title} 시나리오 시작`, 'start')
      const { data: inc, error: incErr } = await supabase.from('incidents').insert({
        incident_type:   scenario.incident_type,
        severity:        scenario.severity,
        title:           scenario.title,
        address:         scenario.address,
        lat:             scenario.lat,
        lon:             scenario.lon,
        initial_report:  scenario.initial_report,
        commander_id:    IDS.commander,
        incident_number: `SIM-${Date.now().toString().slice(-6)}`,
      }).select().single()
      if (incErr) throw incErr

      const iid = inc.id
      addLog(`사고 등록 완료 — ${inc.incident_number}`, 'success')
      await delay(500)
      setPipelineStage(1)

      for (let i = 0; i < scenario.steps.length; i++) {
        const step = scenario.steps[i]
        setStepIdx(i + 1)
        addLog(`[${i + 1}단계] ${step.label}`, 'step')

        for (let j = 0; j < step.vehicles.length; j++) {
          const vid = IDS.vehicles[step.vehicles[j]]
          if (!vid) continue
          const result = await dispatchVehicle(vid, iid, IDS.commander, step.roles[j] || null)
          addLog(`  출동: ${result.ok ? result.vehicle : '⚠ ' + result.error}`, result.ok ? 'dispatch' : 'warn')
          await delay(300)
        }

        if (step.status && step.status !== 'close') {
          await updateIncidentStatus(iid, step.status, step.label, IDS.commander)
          addLog(`  → 상태: ${step.status}`, 'status')
          if (step.status === 'onscene') setPipelineStage(2)
          if (step.status === 'controlled') setPipelineStage(3)
          await delay(400)
        }

        if (step.status === 'close') {
          setPipelineStage(3)
          await closeIncident(iid, IDS.commander, step.report, { injured: 2, deceased: 0, rescued: 3 })
          addLog(`  사고 종료 처리 완료`, 'success')
          setPipelineStage(4)
          addLog(`  AI 지식 추출 파이프라인 트리거 →`, 'extract')
          await delay(1200)
          setPipelineStage(5)
          addLog(`  FIRE.BRAIN 지식 DB 업데이트 완료`, 'brain')
        }

        await delay(300)
      }

      return iid
    } catch (e) {
      addLog(`오류: ${e.message}`, 'error')
      setError(e.message)
      return null
    }
  }

  async function runAllScenarios() {
    if (!isConfigured) { setError('Supabase 연결 후 실행할 수 있습니다.'); return }
    setRunningAll(true)
    setRunning('all')
    setStepIdx(0)
    setLogs([])
    setIncidentIds([])
    setDone(false)
    setError(null)
    setPipelineStage(0)
    const before = await fetchKnowledgeCount()
    setKnowledgeBefore(before)
    const ids = []

    for (let i = 0; i < SCENARIOS.length; i++) {
      setCurrentScenarioIdx(i)
      addLog(`\n━━ [${i + 1}/${SCENARIOS.length}] ${SCENARIOS[i].title} ━━`, 'section')
      const iid = await runScenario(SCENARIOS[i], true)
      if (iid) ids.push(iid)
      setIncidentIds([...ids])
      if (i < SCENARIOS.length - 1) {
        addLog(``, 'info')
        await delay(1000)
      }
    }

    const after = await fetchKnowledgeCount()
    setKnowledgeAfter(after)
    setDone(true)
    setRunningAll(false)
    setRunning(null)
    setCurrentScenarioIdx(-1)
  }

  function reset() {
    setRunning(null)
    setRunningAll(false)
    setCurrentScenarioIdx(-1)
    setStepIdx(0)
    setLogs([])
    setIncidentIds([])
    setDone(false)
    setError(null)
    setPipelineStage(-1)
    setKnowledgeAfter(null)
    fetchKnowledgeCount().then(n => setKnowledgeBefore(n))
  }

  const isRunning = !!running || runningAll

  return (
    <div className="simulation">

      {/* ── 헤더 */}
      <div className="sim-header">
        <h1 className="sim-title">출동 이력 → AI 지식화 파이프라인</h1>
        <p className="sim-desc">
          소방 출동의 모든 행동이 자동 기록되고, 사고 종료 후 AI가 전술 교훈을 추출해
          FIRE.BRAIN 지식 DB에 축적합니다. 아래 시나리오를 실행해 파이프라인 전 과정을 확인하세요.
        </p>
      </div>

      {/* ── 파이프라인 시각화 */}
      <div className="sim-pipeline card">
        {PIPELINE_STAGES.map((stage, i) => (
          <div key={i} className="pipeline-node-wrap">
            <div className={`pipeline-node ${pipelineStage >= i ? 'active' : ''} ${pipelineStage === i ? 'current' : ''} ${i === PIPELINE_STAGES.length - 1 ? 'node-brain' : ''}`}>
              {i === PIPELINE_STAGES.length - 1 ? '🧠' : i + 1}
            </div>
            <div className={`pipeline-label ${pipelineStage >= i ? 'active' : ''}`}>{stage}</div>
            {i < PIPELINE_STAGES.length - 1 && (
              <div className={`pipeline-arrow ${pipelineStage > i ? 'active' : ''}`}>→</div>
            )}
          </div>
        ))}
      </div>

      {/* ── FIRE.BRAIN 지식 현황 + 전체 실행 버튼 */}
      <div className="sim-brain-bar card">
        <div className="brain-bar-left">
          <div className="brain-bar-label">🧠 FIRE.BRAIN 보유 지식</div>
          <div className="brain-bar-count">
            {knowledgeBefore !== null ? `${knowledgeBefore}건` : '—'}
            {knowledgeAfter !== null && knowledgeAfter > knowledgeBefore && (
              <span className="brain-bar-delta">+{knowledgeAfter - knowledgeBefore}건 추가됨</span>
            )}
          </div>
        </div>
        <div className="brain-bar-right">
          {done ? (
            <div className="brain-bar-done-actions">
              <button className="btn btn-ghost" onClick={reset}>초기화</button>
              {onNavigate && (
                <button className="btn btn-ai" onClick={() => onNavigate('firebrain')}>
                  🧠 FIRE.BRAIN에서 지식 확인
                </button>
              )}
            </div>
          ) : (
            <button
              className="btn btn-primary sim-run-all-btn"
              onClick={runAllScenarios}
              disabled={isRunning || !isConfigured}
            >
              {runningAll
                ? <><span className="spin" />시나리오 실행 중 ({currentScenarioIdx + 1}/3)...</>
                : '▶ 시나리오 3개 전체 실행 → FIRE.BRAIN 축적'
              }
            </button>
          )}
        </div>
      </div>

      {!isConfigured && <div className="sim-notice">Supabase 연결 설정 후 실행할 수 있습니다.</div>}
      {error && <div className="error-msg">{error}</div>}

      {/* ── 시나리오 카드 */}
      <div className="scenario-grid">
        {SCENARIOS.map((s, idx) => {
          const isThisRunning = runningAll ? currentScenarioIdx === idx : running === s.id
          const isDone = runningAll
            ? (done || currentScenarioIdx > idx)
            : (running === s.id && done)
          return (
            <div key={s.id} className={`scenario-card card ${isThisRunning ? 'running' : ''} ${isDone && !isThisRunning ? 'card-done' : ''}`}>
              <div className="scenario-card-top">
                <span className="scenario-icon">{s.icon}</span>
                <span className={`badge ${s.badgeClass}`}>{s.badge}</span>
                <span className="scenario-sev">{'★'.repeat(s.severity)}</span>
              </div>
              <h2 className="scenario-title">{s.title}</h2>
              <p className="scenario-report">{s.initial_report}</p>

              <div className="scenario-knowledge-preview">
                <div className="skp-label">추출될 전술 지식</div>
                <div className="skp-content">{s.knowledge_preview}</div>
              </div>

              <div className="scenario-steps">
                {s.steps.map((step, i) => (
                  <div key={i} className={`sim-step ${isThisRunning && i < stepIdx ? 'done' : ''} ${isThisRunning && i === stepIdx - 1 ? 'current' : ''} ${isDone && !isThisRunning ? 'done' : ''}`}>
                    <span className="step-dot-small" />
                    {step.label}
                  </div>
                ))}
              </div>

              {!runningAll && (
                <div className="scenario-actions">
                  {running === s.id ? (
                    <div className="sim-running-status">
                      {done
                        ? <button className="btn btn-ghost" onClick={reset}>초기화</button>
                        : <span className="running-indicator"><span className="spin" />실행 중...</span>
                      }
                      {done && incidentIds[0] && (
                        <button className="btn btn-primary" onClick={() => onSelectIncident(incidentIds[0])}>
                          결과 보기
                        </button>
                      )}
                    </div>
                  ) : (
                    <button
                      className="btn btn-ghost"
                      onClick={() => runScenario(s)}
                      disabled={isRunning || !isConfigured}
                    >
                      단독 실행
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── 완료 결과 배너 */}
      {done && knowledgeAfter !== null && (
        <div className="sim-result-banner card">
          <div className="srb-icon">🧠</div>
          <div className="srb-body">
            <div className="srb-title">파이프라인 완료</div>
            <div className="srb-desc">
              3개 시나리오({incidentIds.length}건 사고)의 전술 행동이 기록되고,
              AI가 교훈을 추출해 FIRE.BRAIN에 축적했습니다.
              {knowledgeAfter > knowledgeBefore
                ? ` 지식 ${knowledgeBefore}건 → ${knowledgeAfter}건으로 증가.`
                : ' (Edge Function 미배포 시 직접 추출은 생략됩니다.)'}
            </div>
          </div>
          {onNavigate && (
            <button className="btn btn-ai" onClick={() => onNavigate('firebrain')}>
              FIRE.BRAIN 확인 →
            </button>
          )}
        </div>
      )}

      {/* ── 실행 로그 */}
      {logs.length > 0 && (
        <div className="sim-log-panel card">
          <div className="card-header">
            <span className="card-title">파이프라인 실행 로그</span>
            {done && <span style={{ color: 'var(--success)', fontSize: 12 }}>✓ 완료</span>}
          </div>
          <div className="sim-log-list">
            {logs.map((l, i) => (
              <div key={i} className={`sim-log-item log-${l.type}`}>
                <span className="sim-log-time">{l.time}</span>
                <span>{l.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
