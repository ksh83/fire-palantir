/**
 * FIRE.BRAIN 사후 지식 추출 Edge Function
 * closeIncident 실행 후 전술 로그 전체를 분석하여
 * 도메인 지식 DB에 교훈 3가지를 자동 적재합니다.
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const EXTRACTION_PROMPT = `당신은 소방 현장 사례 분석 전문가입니다.
아래 사고 정보와 전술 로그를 분석하여 미래 유사 사고에 활용 가능한 교훈을 추출하십시오.

반드시 다음 JSON 배열 형식으로만 응답하십시오 (최대 3개):
[
  {
    "title": "교훈 제목 (20자 이내)",
    "content": "구체적 교훈 내용 (100~200자, 다음 출동에 즉시 적용 가능하게)",
    "tags": ["태그1", "태그2"]
  }
]

기준:
- 이번 사고에서 잘한 점과 개선점 모두 포함
- AI 개입이 있었던 경우 AI 판단의 정확도도 평가
- 특정 전술·장비·자원 운용에 관한 구체적 내용
- 다음 유사 사고에서 바로 적용 가능한 실용적 내용`

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    const { incident_id } = await req.json()
    if (!incident_id) {
      return new Response(
        JSON.stringify({ error: 'incident_id 필수' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY 미설정')

    // 추출 기록 생성
    const { data: extraction } = await supabase
      .from('knowledge_extractions')
      .insert({ incident_id, status: 'processing' })
      .select().single()

    // 사고 + 전술 로그 조회
    const [{ data: incident }, { data: logs }] = await Promise.all([
      supabase.from('incidents').select('*').eq('id', incident_id).single(),
      supabase.from('tactical_logs')
        .select('action_type, content, ai_assisted, ai_model, created_at')
        .eq('incident_id', incident_id)
        .order('created_at'),
    ])

    if (!incident) throw new Error('사고를 찾을 수 없습니다')

    const elapsed = incident.closed_at
      ? Math.round((new Date(incident.closed_at).getTime() - new Date(incident.reported_at).getTime()) / 60000)
      : 0

    const incidentSummary = `
사고 유형: ${incident.incident_type}
위험도: ${incident.severity}/5
위치: ${incident.address}
총 소요 시간: ${elapsed}분
최종 보고: ${incident.final_report || '없음'}
사상자: ${JSON.stringify(incident.casualties)}
`
    const logsText = (logs || []).map(l =>
      `[${new Date(l.created_at).toLocaleTimeString('ko-KR')}] ${l.action_type}${l.ai_assisted ? ' (AI)' : ''}: ${l.content}`
    ).join('\n')

    // Claude API 호출 (prompt caching)
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: [
          { type: 'text', text: EXTRACTION_PROMPT, cache_control: { type: 'ephemeral' } },
        ],
        messages: [{
          role: 'user',
          content: `【사고 정보】\n${incidentSummary}\n\n【전술 로그 (${logs?.length || 0}건)】\n${logsText}`,
        }],
      }),
    })

    if (!response.ok) {
      const err = await response.json()
      throw new Error(err.error?.message || `Claude API 오류 ${response.status}`)
    }

    const data = await response.json()
    const raw = data.content[0].text

    // JSON 파싱
    const jsonMatch = raw.match(/\[[\s\S]*\]/)
    const items: Array<{ title: string; content: string; tags: string[] }> =
      jsonMatch ? JSON.parse(jsonMatch[0]) : []

    // knowledge_items 저장
    if (items.length > 0) {
      await supabase.from('knowledge_items').insert(
        items.map(item => ({
          title:         item.title,
          incident_type: incident.incident_type,
          content:       item.content,
          tags:          item.tags || [],
          source:        'auto_extracted',
          incident_id,
        }))
      )
    }

    // 추출 완료 기록
    await supabase.from('knowledge_extractions')
      .update({ status: 'completed', items_extracted: items.length, completed_at: new Date().toISOString() })
      .eq('id', extraction?.id)

    return new Response(
      JSON.stringify({ ok: true, items_extracted: items.length, items }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )

  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
