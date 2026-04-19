import { useState, useRef, useEffect } from 'react'
import { logAiCopilot } from '../lib/supabase'
import './AiCopilot.css'

const DEMO_COMMANDER_ID = '30000000-0000-0000-0000-000000000001'

function buildContext(incident, dispatches) {
  const lines = [
    `【사고 정보】`,
    `번호: ${incident.incident_number || '-'}`,
    `유형: ${incident.incident_type} | 위험도: ${incident.severity}/5`,
    `위치: ${incident.address}`,
    `현재 상태: ${incident.status}`,
    `경과 시간: ${Math.floor((Date.now() - new Date(incident.reported_at)) / 60000)}분`,
    '',
    `【투입 차량 현황】`,
  ]
  if (dispatches.length === 0) {
    lines.push('출동 차량 없음')
  } else {
    dispatches.forEach(d => {
      lines.push(`- ${d.vehicles?.call_sign} (${d.role_at_scene || '역할미정'}) → ${d.vehicles?.status}`)
    })
  }
  if (incident.buildings) {
    const b = incident.buildings
    lines.push('', `【건물 정보】`)
    lines.push(`유형: ${b.building_type} | ${b.floors_above}층/${b.floors_below}지하`)
    if (b.has_sprinkler) lines.push('스프링클러: 있음')
    if (b.has_hazmat)   lines.push(`위험물: ${b.hazmat_info || '있음'}`)
  }
  if (incident.initial_report) {
    lines.push('', `【초기 보고】`, incident.initial_report)
  }
  return lines.join('\n')
}

// Edge Function URL (Supabase 배포 후 자동으로 VITE_SUPABASE_URL 에서 파생)
function edgeFunctionUrl() {
  const base = import.meta.env.VITE_SUPABASE_URL
  return base ? `${base}/functions/v1/fire-copilot` : null
}

// 신뢰도 레이블
function confidenceLabel(v) {
  if (v >= 0.8) return { text: '높음', cls: 'conf-high' }
  if (v >= 0.5) return { text: '보통', cls: 'conf-mid' }
  return { text: '낮음', cls: 'conf-low' }
}

// 구조화 JSON 응답 렌더링
function StructuredResponse({ parsed }) {
  if (!parsed) return null
  return (
    <div className="ai-structured">
      {parsed.situation_summary && (
        <div className="ai-section">
          <div className="ai-section-label">상황 분석</div>
          <p>{parsed.situation_summary}</p>
        </div>
      )}
      {parsed.immediate_action && (
        <div className="ai-section ai-action">
          <div className="ai-section-label">즉시 조치</div>
          <p>{parsed.immediate_action}</p>
        </div>
      )}
      {parsed.tactical_options?.length > 0 && (
        <div className="ai-section">
          <div className="ai-section-label">전술 선택지</div>
          {parsed.tactical_options.map((opt, i) => {
            const conf = confidenceLabel(opt.confidence ?? 0.5)
            return (
              <div key={i} className="tactical-option">
                <div className="option-header">
                  <span className="option-num">{i + 1}</span>
                  <span className="option-name">{opt.option}</span>
                  <span className={`conf-badge ${conf.cls}`}>{conf.text}</span>
                </div>
                <div className="option-rationale">{opt.rationale}</div>
                {opt.risks && <div className="option-risks">주의: {opt.risks}</div>}
              </div>
            )
          })}
        </div>
      )}
      {parsed.data_basis && (
        <div className="ai-basis">근거: {parsed.data_basis}</div>
      )}
    </div>
  )
}

// demo 모드 응답 (Edge Function 미연결 시)
function makeDemoResponse(query, incident, dispatches) {
  const elapsed = Math.floor((Date.now() - new Date(incident.reported_at)) / 60000)
  return {
    raw: '',
    parsed: {
      situation_summary: `${incident.title} 발생 ${elapsed}분 경과. 투입 차량 ${dispatches.length}대. 위험도 ${incident.severity}/5.`,
      immediate_action: '진입 전 건물 구조 파악 및 진입로 확보 우선 확인',
      tactical_options: [
        { option: '직접 진입 공격', rationale: '초기 화재 규모 소형 시 표준 전술', risks: '내부 구조 미파악 시 위험', confidence: 0.7 },
        { option: '방어적 주수 후 진입', rationale: '고층·고위험 건물 표준 접근법', risks: '시간 지연으로 확대 가능', confidence: 0.6 },
      ],
      data_basis: '소방 전술 기본 교리 (데모 모드 — Edge Function 연결 시 실제 AI 분석)',
    },
    _demo: true,
  }
}

export default function AiCopilot({ incident, dispatches, onClose }) {
  const [messages, setMessages] = useState([])
  const [input,    setInput]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)
  const bottomRef = useRef(null)

  const fnUrl = edgeFunctionUrl()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const QUICK_QUERIES = [
    '현재 상황 브리핑',
    '추가 자원 필요한가?',
    '진입 전술 옵션은?',
    '인명 구조 우선순위',
    '철수 시점 판단',
  ]

  async function send(query) {
    if (!query.trim() || loading) return
    setInput('')
    setError(null)

    const userMsg = { role: 'user', content: query, _display: query }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      let result

      if (!fnUrl) {
        await new Promise(r => setTimeout(r, 700))
        result = makeDemoResponse(query, incident, dispatches)
      } else {
        const context = buildContext(incident, dispatches)
        const history = messages
          .filter(m => !m._demo)
          .map(m => ({ role: m.role, content: m.content }))

        const res = await fetch(fnUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
          },
          body: JSON.stringify({
            incident_id:   incident.id,
            incident_type: incident.incident_type,
            query,
            context,
            history,
          }),
        })

        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || `Edge Function 오류 ${res.status}`)
        }
        result = await res.json()
      }

      const aiMsg = {
        role: 'assistant',
        content: result.raw || '',
        parsed: result.parsed,
        _demo: result._demo,
      }
      setMessages(prev => [...prev, aiMsg])

      // TacticalLog 기록
      if (!result._demo) {
        await logAiCopilot(
          incident.id,
          DEMO_COMMANDER_ID,
          query,
          result.raw || JSON.stringify(result.parsed)
        ).catch(() => {})
      }
    } catch (e) {
      setError(e.message)
      setMessages(prev => prev.slice(0, -1))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="ai-copilot card">
      <div className="copilot-header">
        <div>
          <span className="ai-badge">AI</span>
          <span className="copilot-title">FIRE-PALANTIR 코파일럿</span>
          {!fnUrl && <span className="demo-badge">데모</span>}
        </div>
        <button className="btn btn-ghost" style={{ padding: '4px 8px' }} onClick={onClose}>✕</button>
      </div>

      {!fnUrl && (
        <div className="api-notice">
          데모 모드 — Supabase Edge Function 배포 후 실제 Claude AI 사용 가능
        </div>
      )}

      <div className="quick-queries">
        {QUICK_QUERIES.map(q => (
          <button key={q} className="quick-btn" onClick={() => send(q)} disabled={loading}>
            {q}
          </button>
        ))}
      </div>

      <div className="copilot-messages">
        {messages.length === 0 && (
          <div className="copilot-empty">
            빠른 질의 버튼을 누르거나 직접 질문하세요.<br />
            모든 AI 응답은 전술 로그에 자동 기록됩니다.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg msg-${m.role}`}>
            <div className="msg-label">{m.role === 'user' ? '지휘관' : '🤖 AI'}</div>
            {m.role === 'assistant' && m.parsed
              ? <StructuredResponse parsed={m.parsed} />
              : <div className="msg-content" style={{ whiteSpace: 'pre-wrap' }}>{m._display || m.content}</div>
            }
          </div>
        ))}
        {loading && (
          <div className="msg msg-assistant">
            <div className="msg-label">🤖 AI</div>
            <div className="msg-content thinking"><span /><span /><span /></div>
          </div>
        )}
        {error && <div className="error-msg">{error}</div>}
        <div ref={bottomRef} />
      </div>

      <div className="copilot-input">
        <input
          className="input"
          style={{ marginBottom: 0 }}
          placeholder="현장 상황을 질의하세요..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send(input)}
          disabled={loading}
        />
        <button
          className="btn btn-ai"
          onClick={() => send(input)}
          disabled={!input.trim() || loading}
        >전송</button>
      </div>
    </div>
  )
}
