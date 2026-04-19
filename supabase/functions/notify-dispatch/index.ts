/**
 * FIRE-PALANTIR 운영 자동화 알림 Edge Function
 *
 * dispatchVehicle 실행 후 호출:
 *  1. SafePass — 출동 경로 교차로 신호 우선 제어 요청
 *     (미연동 시: 관할 경찰서 자동 문자 시뮬레이션)
 *  2. KakaoTalk — 역할별 차등 알림
 *     현장대원: 출동 정보 + AI 요약
 *     지휘관:   전술 판단 지원 링크
 *     상황실:   실시간 대시보드 링크
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── SafePass ────────────────────────────────────────────────────

interface SafePassRequest {
  vehicleId:    string
  vehicleSign:  string
  incidentId:   string
  fromLat:      number
  fromLon:      number
  toLat:        number
  toLon:        number
  incidentType: string
}

async function requestSafePass(
  supabase: ReturnType<typeof createClient>,
  params: SafePassRequest
): Promise<{ status: string; message: string }> {
  const apiKey = Deno.env.get('SAFEPASS_API_KEY')

  // 교차로 간이 추정 (출발점~도착점 사이 격자점 3개)
  const intersections = [1, 2, 3].map(i => ({
    seq:  i,
    lat:  params.fromLat + (params.toLat - params.fromLat) * (i / 4),
    lon:  params.fromLon + (params.toLon - params.fromLon) * (i / 4),
    name: `경유 교차로 ${i}`,
  }))

  let status = 'simulated'
  let providerResponse: Record<string, unknown> = { simulated: true }

  if (apiKey) {
    try {
      const res = await fetch('https://api.safepass.go.kr/v1/preemption/request', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicle_id:   params.vehicleSign,
          incident_id:  params.incidentId,
          from: { lat: params.fromLat, lon: params.fromLon },
          to:   { lat: params.toLat,   lon: params.toLon },
        }),
      })
      providerResponse = await res.json()
      status = res.ok ? 'approved' : 'failed'
    } catch {
      status = 'failed'
    }
  }

  // SafePass 요청 로그
  await supabase.from('safepass_requests').insert({
    incident_id:      params.incidentId,
    vehicle_id:       params.vehicleId,
    vehicle_call_sign: params.vehicleSign,
    route_description: `${params.fromLat.toFixed(4)},${params.fromLon.toFixed(4)} → ${params.toLat.toFixed(4)},${params.toLon.toFixed(4)}`,
    intersections,
    status,
    provider_response: providerResponse,
  })

  // SafePass 미연동 시: 관할 경찰서 문자 알림 로그
  if (status === 'simulated' || status === 'failed') {
    await supabase.from('notifications').insert({
      incident_id:       params.incidentId,
      vehicle_id:        params.vehicleId,
      notification_type: 'sms_police',
      recipient:         '063-280-8112',  // 전주덕진경찰서
      recipient_role:    'police',
      title:             `[소방출동] ${params.vehicleSign} 출동`,
      message:           `전주덕진소방서 ${params.vehicleSign} 출동. ${params.incidentType} 사고 대응. 긴급차량 통행 협조 요청.`,
      status:            'simulated',
      provider_response: { note: 'SafePass API 미연결 — 실제 운영 시 자동 전송' },
    })
  }

  return { status, message: `SafePass ${status} (교차로 ${intersections.length}개)` }
}

// ── KakaoTalk ───────────────────────────────────────────────────

interface KakaoTarget {
  role:       string
  phone:      string
  name:       string
  message:    string
  link?:      string
}

async function sendKakaoNotification(
  supabase: ReturnType<typeof createClient>,
  incidentId: string,
  vehicleId:  string,
  targets:    KakaoTarget[]
): Promise<void> {
  const kakaoKey = Deno.env.get('KAKAO_REST_API_KEY')
  const appUrl   = Deno.env.get('APP_URL') || 'https://fire-palantir.vercel.app'

  for (const target of targets) {
    let status: string
    let providerResponse: Record<string, unknown>

    if (kakaoKey) {
      try {
        // KakaoTalk BizMessage (알림톡) API
        const res = await fetch('https://kapi.kakao.com/v1/api/talk/friends/message/send', {
          method: 'POST',
          headers: {
            'Authorization': `KakaoAK ${kakaoKey}`,
            'Content-Type':  'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            receiver_uuids: JSON.stringify([target.phone]),
            template_object: JSON.stringify({
              object_type: 'text',
              text: target.message,
              link: { mobile_web_url: target.link || appUrl },
            }),
          }),
        })
        providerResponse = await res.json()
        status = res.ok ? 'sent' : 'failed'
      } catch {
        status = 'failed'
        providerResponse = { error: 'API 호출 실패' }
      }
    } else {
      status = 'simulated'
      providerResponse = { note: 'KAKAO_REST_API_KEY 미설정 — 실제 운영 시 자동 전송' }
    }

    await supabase.from('notifications').insert({
      incident_id:       incidentId,
      vehicle_id:        vehicleId,
      notification_type: `kakao_${target.role}`,
      recipient:         target.phone,
      recipient_role:    target.role,
      title:             `[FIRE-PALANTIR] ${target.name}`,
      message:           target.message,
      status,
      provider_response: providerResponse,
      sent_at:           status !== 'pending' ? new Date().toISOString() : null,
    })
  }
}

// ── Main ────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    const {
      incident_id, vehicle_id, vehicle_call_sign,
      incident_type, incident_address,
      incident_lat, incident_lon,
      station_lat,  station_lon,
      commander_name, commander_phone,
      crew_phones,
    } = await req.json()

    if (!incident_id || !vehicle_id) {
      return new Response(
        JSON.stringify({ error: 'incident_id, vehicle_id 필수' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    const appUrl = Deno.env.get('APP_URL') || 'https://fire-palantir.vercel.app'

    const results: Record<string, unknown> = {}

    // 1. SafePass 요청
    results.safepass = await requestSafePass(supabase, {
      vehicleId:    vehicle_id,
      vehicleSign:  vehicle_call_sign,
      incidentId:   incident_id,
      fromLat:      station_lat  || 35.8442,
      fromLon:      station_lon  || 127.1068,
      toLat:        incident_lat || 35.8500,
      toLon:        incident_lon || 127.1200,
      incidentType: incident_type || '사고',
    })

    // 2. KakaoTalk 역할별 차등 알림
    const incidentTypeKr: Record<string, string> = {
      fire: '화재', rescue: '구조', ems: '구급',
      hazmat: '화학', flood: '수해', other: '기타',
    }
    const typeLabel = incidentTypeKr[incident_type] || incident_type || '사고'
    const detailUrl = `${appUrl}/incident/${incident_id}`

    const kakaoTargets: KakaoTarget[] = [
      // 현장대원: 출동 정보 + 위치
      {
        role:    'field',
        phone:   '01012345678',  // 실제 운영 시 personnel DB에서 조회
        name:    `${vehicle_call_sign} 출동 대원`,
        message: `[출동 명령]\n차량: ${vehicle_call_sign}\n유형: ${typeLabel}\n위치: ${incident_address}\n\n현장 도착 즉시 지휘관에게 보고하십시오.`,
        link:    detailUrl,
      },
      // 지휘관: 전술 판단 지원 링크
      {
        role:    'commander',
        phone:   commander_phone || '01098765432',
        name:    commander_name ? `지휘관 ${commander_name}` : '현장 지휘관',
        message: `[지휘관 알림]\n${typeLabel} 사고 발생\n위치: ${incident_address}\n\n아래 링크에서 AI 코파일럿 및 실시간 현황을 확인하십시오.`,
        link:    detailUrl,
      },
      // 상황실: 대시보드 링크
      {
        role:    'dispatch',
        phone:   '01000001119',
        name:    '상황실',
        message: `[상황실 알림]\n${typeLabel} 사고 — ${vehicle_call_sign} 출동\n위치: ${incident_address}\n\n실시간 현황 대시보드를 확인하십시오.`,
        link:    appUrl,
      },
    ]

    await sendKakaoNotification(supabase, incident_id, vehicle_id, kakaoTargets)
    results.kakao = `${kakaoTargets.length}개 알림 처리`

    return new Response(
      JSON.stringify({ ok: true, ...results }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )

  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
