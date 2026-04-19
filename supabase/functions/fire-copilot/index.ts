import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const FIRE_COMMANDER_SYSTEM_PROMPT = `당신은 FIRE-PALANTIR 소방 현장 지휘관 AI 코파일럿입니다.
현직 소방관이 실제 현장에서 사용하는 시스템입니다.

핵심 원칙:
1. AI는 브리핑하고 지휘관이 결정합니다 — 명령이 아닌 판단 자료를 제공합니다
2. 모든 판단에 근거 데이터를 명시합니다 (유사 사례 또는 소방 전술 원칙)
3. 인명 안전을 절대 최우선으로 합니다
4. 현장에서 읽기 쉽게 간결하게 작성합니다

반드시 다음 JSON 형식으로만 응답하십시오:
{
  "situation_summary": "현황 요약 (2~3문장, 핵심만)",
  "tactical_options": [
    {
      "option": "전술 선택지 명칭",
      "rationale": "근거 (소방 전술 원칙 또는 유사 사례 포함)",
      "risks": "위험 요소",
      "confidence": 0.0
    }
  ],
  "immediate_action": "즉시 조치 권고 (1~2줄)",
  "data_basis": "판단 근거 출처 (FIRE.BRAIN 유사 사례 또는 교리)"
}

제약:
- 확신도(confidence): 인명 피해 가능 판단은 반드시 0.8 이하
- 불확실한 정보를 확실한 것처럼 표현하지 마십시오
- tactical_options는 최대 3개`

/** FIRE.BRAIN 텍스트 기반 RAG 검색 (embedding 없는 fallback) */
async function searchKnowledge(
  supabase: ReturnType<typeof createClient>,
  query: string,
  incidentType: string | null
): Promise<string> {
  const { data } = await supabase.rpc('search_knowledge_text', {
    p_query: query,
    p_type:  incidentType || null,
    p_limit: 3,
  })

  if (!data || data.length === 0) return ''

  return '\n\n【FIRE.BRAIN 유사 사례·교훈】\n' +
    data.map((item: { title: string; content: string }, i: number) =>
      `[사례 ${i + 1}] ${item.title}\n${item.content}`
    ).join('\n\n')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    const { incident_id, query, context, history, incident_type } = await req.json()

    if (!query || !context) {
      return new Response(
        JSON.stringify({ error: 'query와 context는 필수입니다' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'ANTHROPIC_API_KEY 미설정' }),
        { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    // FIRE.BRAIN RAG 검색
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    const ragContext = await searchKnowledge(supabase, query, incident_type ?? null)

    const userContent = `현재 사고 데이터:\n${context}${ragContext}\n\n질문: ${query}`

    const messages = [
      ...(history || []),
      { role: 'user', content: userContent },
    ]

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
          {
            type: 'text',
            text: FIRE_COMMANDER_SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages,
      }),
    })

    if (!response.ok) {
      const err = await response.json()
      throw new Error(err.error?.message || `Claude API 오류 ${response.status}`)
    }

    const data = await response.json()
    const raw = data.content[0].text

    let parsed = null
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0])
    } catch (_) { /* raw 텍스트로 fallback */ }

    return new Response(
      JSON.stringify({ raw, parsed, incident_id, rag_used: !!ragContext, usage: data.usage }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )

  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
