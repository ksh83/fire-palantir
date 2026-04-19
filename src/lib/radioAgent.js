import { supabase } from './supabase'

const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY
const DEMO_COMMANDER_ID = '30000000-0000-0000-0000-000000000001'

// ── 5단계 데모 시나리오 (이천 물류창고 화재) ───────────────────────
export const DEMO_SCENARIOS = [
  {
    label: 'T+0 최초도착',
    text: '본대 도착. 3층 창고 전면 연기 확산, 화재 확인. 인원 없음 확인 중.',
    mock: {
      fire_stage: '초기',
      par_action: '없음',
      par_count: 0,
      resource_requests: [],
      hazards: ['연기 확산'],
      severity_upgrade: false,
      new_severity: 3,
      summary: '3층 창고 화재 확인. 초기 단계, 연기 확산 중.',
      immediate_actions: ['진입팀 준비', '건물 인원 현황 파악'],
    },
  },
  {
    label: 'T+5 화염확산',
    text: '3층 전체 화염 확산. 연기 농도 심각. 실종자 2명 추정. 관창 추가 요청.',
    mock: {
      fire_stage: '중기',
      par_action: '없음',
      par_count: 0,
      resource_requests: ['관창 추가'],
      hazards: ['연기 농도 심각', '실종자 2명 추정'],
      severity_upgrade: true,
      new_severity: 4,
      summary: '3층 전체 화염 확산, 실종자 2명 추정. 위험도 상향.',
      immediate_actions: ['구조팀 즉시 진입 준비', '관창 추가 배치', '구조요청자 위치 파악'],
    },
  },
  {
    label: 'T+10 대원진입',
    text: '대원 4명 3층 진입. 내부 수색 중. 방화문 강제 개방.',
    mock: {
      fire_stage: '중기',
      par_action: '진입',
      par_count: 4,
      resource_requests: [],
      hazards: [],
      severity_upgrade: false,
      new_severity: 4,
      summary: '대원 4명 3층 진입 완료. 내부 수색 진행 중.',
      immediate_actions: ['30분 후 PAR 확인 알림 설정', '진입 시각 공식 기록'],
    },
  },
  {
    label: 'T+15 위험물',
    text: '위험물 드럼통 발견. 폭발 위험. 경계선 50m 확장 요청. 고가차 배치 요청.',
    mock: {
      fire_stage: '성기',
      par_action: '없음',
      par_count: 4,
      resource_requests: ['고가차', '경계선 확장 50m'],
      hazards: ['위험물 드럼통', '폭발 위험'],
      severity_upgrade: true,
      new_severity: 5,
      summary: '위험물 드럼통 발견, 폭발 위험. 최고위험 단계 격상.',
      immediate_actions: ['경계선 즉시 50m 확장', '고가차 배치', '진입 대원 위험구역 이탈 확인'],
    },
  },
  {
    label: 'T+25 구조완료',
    text: '화세 감소. 잔화 정리 중. 실종자 2명 구조 완료. 병원 후송.',
    mock: {
      fire_stage: '초기',
      par_action: '복귀',
      par_count: 0,
      resource_requests: [],
      hazards: [],
      severity_upgrade: false,
      new_severity: 3,
      summary: '화세 감소, 잔화 정리 중. 실종자 2명 구조 완료.',
      immediate_actions: ['구조자 병원 후송 확인', '잔화 정리 완료 후 귀소 준비'],
    },
  },
]

// ── Claude API 호출 ────────────────────────────────────────────────
async function callClaudeParser(radioText, incident) {
  const systemPrompt = `당신은 소방 무전 내용을 분석하는 AI 에이전트입니다.
무전 텍스트에서 상황 정보를 추출해 JSON만 응답하세요. 설명 없이 JSON만.

화재 단계 기준:
- 초기: 발화점 한정, 소규모
- 중기: 1-2개 구역 확산
- 성기: 전면 확산, 통제 어려움
- 대형: 인접 건물 위협, 통제불능
- 미확인: 판단 불가

응답 형식:
{
  "fire_stage": "초기"|"중기"|"성기"|"대형"|"미확인",
  "par_action": "진입"|"복귀"|"부상"|"없음",
  "par_count": 숫자,
  "resource_requests": ["항목"],
  "hazards": ["항목"],
  "severity_upgrade": true|false,
  "new_severity": 1~5,
  "summary": "1-2문장",
  "immediate_actions": ["항목"]
}`

  const userContent = `현재 사고: ${incident.title} / ${incident.address}
현재 화재단계: ${incident.fire_stage || '미확인'} / 현재 위험도: ${incident.severity}/5

무전 내용: "${radioText}"`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userContent }],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Claude API 오류: ${res.status} ${err}`)
  }

  const json = await res.json()
  const text = json.content?.[0]?.text || '{}'
  return JSON.parse(text.trim())
}

// ── 분석 결과 → 사람이 읽을 수 있는 로그 텍스트 ──────────────────
function formatAnalysisContent(radioText, analysis) {
  const lines = [`[무전] ${radioText}`, ``, `[AI 분석]`]
  lines.push(`화재단계: ${analysis.fire_stage}`)
  if (analysis.par_action !== '없음') {
    lines.push(`PAR: 대원 ${analysis.par_count}명 ${analysis.par_action}`)
  }
  if (analysis.hazards?.length) {
    lines.push(`위험요소: ${analysis.hazards.join(', ')}`)
  }
  if (analysis.resource_requests?.length) {
    lines.push(`자원요청: ${analysis.resource_requests.join(', ')}`)
  }
  if (analysis.immediate_actions?.length) {
    lines.push(`즉각조치:`)
    analysis.immediate_actions.forEach(a => lines.push(`  · ${a}`))
  }
  lines.push(``, analysis.summary)
  return lines.join('\n')
}

// ── 메인 파이프라인 ────────────────────────────────────────────────
export async function processRadioMessage(incidentId, radioText, incident, mockAnalysis = null) {
  const now = new Date().toISOString()

  // 1. 원본 무전 로그 삽입
  const { error: insertErr1 } = await supabase.from('tactical_logs').insert({
    incident_id:  incidentId,
    actor_id:     DEMO_COMMANDER_ID,
    action_type:  'radio_input',
    content:      radioText,
    ai_assisted:  false,
    metadata:     { source: 'radio_simulation', timestamp: now },
  })
  if (insertErr1) throw new Error(`무전 로그 삽입 실패: ${insertErr1.message}`)

  // 2. Claude 분석 or 데모 mock
  let analysis
  if (mockAnalysis) {
    analysis = mockAnalysis
    await new Promise(r => setTimeout(r, 900)) // 실감나는 처리 딜레이
  } else if (ANTHROPIC_KEY) {
    analysis = await callClaudeParser(radioText, incident)
  } else {
    throw new Error('VITE_ANTHROPIC_API_KEY 미설정 — 프리셋 시나리오를 사용하거나 .env.local에 키를 입력하세요')
  }

  // 3. AI 분석 로그 삽입
  const { error: insertErr2 } = await supabase.from('tactical_logs').insert({
    incident_id:  incidentId,
    actor_id:     DEMO_COMMANDER_ID,
    action_type:  'radio_analysis',
    content:      formatAnalysisContent(radioText, analysis),
    ai_assisted:  true,
    ai_model:     'claude-sonnet-4-6',
    metadata:     { analysis },
  })
  if (insertErr2) throw new Error(`분석 로그 삽입 실패: ${insertErr2.message}`)

  // 4. 사고 필드 업데이트
  const updates = {
    fire_stage:   analysis.fire_stage,
    par_count:    analysis.par_count,
    hazmat_risk:  analysis.hazards?.some(h => h.includes('위험물') || h.includes('폭발')) || false,
    updated_at:   now,
  }
  if (analysis.severity_upgrade && analysis.new_severity > (incident.severity || 0)) {
    updates.severity = analysis.new_severity
  }

  const { error: updateErr } = await supabase.from('incidents').update(updates).eq('id', incidentId)
  if (updateErr) console.warn('[radioAgent] incidents 업데이트 실패:', updateErr.message)

  return analysis
}
