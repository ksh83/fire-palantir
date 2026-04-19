import { useState } from 'react'
import { processRadioMessage, DEMO_SCENARIOS } from '../lib/radioAgent'
import './RadioAgent.css'

const FIRE_STAGE_COLOR = {
  '초기': 'var(--success)',
  '중기': 'var(--warn)',
  '성기': 'var(--danger)',
  '대형': '#ff0000',
  '미확인': 'var(--text3)',
}

export default function RadioAgent({ incidentId, incident }) {
  const [radioText,    setRadioText]    = useState('')
  const [processing,   setProcessing]   = useState(false)
  const [lastAnalysis, setLastAnalysis] = useState(null)
  const [lastRadio,    setLastRadio]    = useState('')
  const [error,        setError]        = useState(null)
  const [activeScenario, setActiveScenario] = useState(null)

  async function handle(text, mock = null, scenarioIdx = null) {
    if (!text.trim() || processing) return
    setProcessing(true)
    setError(null)
    setLastAnalysis(null)
    setLastRadio(text)
    setActiveScenario(scenarioIdx)

    try {
      const result = await processRadioMessage(incidentId, text, incident, mock)
      setLastAnalysis(result)
      setRadioText('')
    } catch (e) {
      setError(e.message)
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="card radio-agent-card">
      <div className="card-header">
        <span className="card-title">
          <span className={`radio-live-dot ${processing ? 'processing' : 'live'}`} />
          무전 에이전트
        </span>
        <span className="radio-status-badge">
          {processing ? '분석 중...' : 'LIVE'}
        </span>
      </div>

      {/* 프리셋 시나리오 버튼 */}
      <div className="scenario-grid">
        {DEMO_SCENARIOS.map((s, i) => (
          <button
            key={i}
            className={`scenario-btn ${activeScenario === i ? 'active' : ''}`}
            onClick={() => handle(s.text, s.mock, i)}
            disabled={processing}
            title={s.text}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="radio-divider">또는 직접 입력</div>

      {/* 직접 입력 */}
      <div className="radio-input-wrap">
        <textarea
          className="radio-textarea"
          placeholder="무전 내용을 입력하세요..."
          value={radioText}
          onChange={e => setRadioText(e.target.value)}
          rows={3}
          disabled={processing}
          onKeyDown={e => {
            if (e.key === 'Enter' && e.ctrlKey) handle(radioText)
          }}
        />
        <button
          className="btn btn-primary radio-submit"
          onClick={() => handle(radioText)}
          disabled={!radioText.trim() || processing}
        >
          {processing
            ? <span className="processing-dots"><span/><span/><span/></span>
            : '⚡ 무전 처리'}
        </button>
      </div>

      {/* 오류 */}
      {error && <div className="radio-error">{error}</div>}

      {/* AI 분석 결과 */}
      {lastAnalysis && (
        <div className="analysis-result">
          <div className="analysis-header">
            <span className="ai-tag">AI</span>
            <span className="analysis-title">무전 분석 완료</span>
          </div>

          <div className="analysis-radio-text">📡 {lastRadio}</div>

          <div className="analysis-metrics">
            <div className="metric">
              <div className="metric-label">화재단계</div>
              <div className="metric-value" style={{ color: FIRE_STAGE_COLOR[lastAnalysis.fire_stage] }}>
                {lastAnalysis.fire_stage}
              </div>
            </div>
            {lastAnalysis.par_action !== '없음' && (
              <div className="metric">
                <div className="metric-label">PAR</div>
                <div className="metric-value">{lastAnalysis.par_count}명 {lastAnalysis.par_action}</div>
              </div>
            )}
            {lastAnalysis.severity_upgrade && (
              <div className="metric">
                <div className="metric-label">위험도</div>
                <div className="metric-value danger">↑ {lastAnalysis.new_severity}/5</div>
              </div>
            )}
          </div>

          {lastAnalysis.hazards?.length > 0 && (
            <div className="analysis-section">
              <span className="analysis-section-label">⚠️ 위험요소</span>
              <div className="tag-list">
                {lastAnalysis.hazards.map((h, i) => (
                  <span key={i} className="tag tag-danger">{h}</span>
                ))}
              </div>
            </div>
          )}

          {lastAnalysis.resource_requests?.length > 0 && (
            <div className="analysis-section">
              <span className="analysis-section-label">📋 자원요청</span>
              <div className="tag-list">
                {lastAnalysis.resource_requests.map((r, i) => (
                  <span key={i} className="tag tag-info">{r}</span>
                ))}
              </div>
            </div>
          )}

          {lastAnalysis.immediate_actions?.length > 0 && (
            <div className="analysis-section">
              <span className="analysis-section-label">⚡ 즉각조치</span>
              <ul className="action-list">
                {lastAnalysis.immediate_actions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="analysis-summary">{lastAnalysis.summary}</div>
        </div>
      )}
    </div>
  )
}
