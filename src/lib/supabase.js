import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.warn('[FIRE-PALANTIR] Supabase 환경변수 미설정 — .env 파일을 확인하세요')
}

export const supabase = createClient(supabaseUrl || '', supabaseKey || '')

// ── Action Types (팔란티어 패턴: DB 함수 호출) ─────────────────

/** 출동 명령 — Action 실행 후 SafePass + KakaoTalk 자동 트리거 */
export async function dispatchVehicle(vehicleId, incidentId, commanderId, role = null) {
  const { data, error } = await supabase.rpc('action_dispatch_vehicle', {
    p_vehicle_id:   vehicleId,
    p_incident_id:  incidentId,
    p_commander_id: commanderId,
    p_role:         role,
  })
  if (error) throw error

  // 출동 성공 시 알림 자동 트리거 (비동기, 실패해도 출동에 영향 없음)
  if (data?.ok) {
    triggerDispatchNotifications(vehicleId, incidentId).catch(() => {})
  }

  return data
}

/** 출동 알림 비동기 트리거 (SafePass + KakaoTalk) */
async function triggerDispatchNotifications(vehicleId, incidentId) {
  const fnUrl = supabaseUrl ? `${supabaseUrl}/functions/v1/notify-dispatch` : null
  if (!fnUrl) return

  // 사고 + 차량 + 소방서 정보 조회
  const [{ data: incident }, { data: vehicle }] = await Promise.all([
    supabase.from('incidents').select('incident_type, address, lat, lon, personnel!incidents_commander_id_fkey(name, contact_phone)').eq('id', incidentId).single(),
    supabase.from('vehicles').select('call_sign, stations(lat, lon)').eq('id', vehicleId).single(),
  ])

  await fetch(fnUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseKey || '',
    },
    body: JSON.stringify({
      incident_id:      incidentId,
      vehicle_id:       vehicleId,
      vehicle_call_sign: vehicle?.call_sign,
      incident_type:    incident?.incident_type,
      incident_address: incident?.address,
      incident_lat:     incident?.lat,
      incident_lon:     incident?.lon,
      station_lat:      vehicle?.stations?.lat,
      station_lon:      vehicle?.stations?.lon,
      commander_name:   incident?.personnel?.name,
      commander_phone:  incident?.personnel?.contact_phone,
    }),
  })
}

/** 사고 상태 업데이트 */
export async function updateIncidentStatus(incidentId, status, note, actorId, aiAssisted = false) {
  const { data, error } = await supabase.rpc('action_update_incident_status', {
    p_incident_id: incidentId,
    p_status:      status,
    p_note:        note,
    p_actor_id:    actorId,
    p_ai_assisted: aiAssisted,
    p_ai_model:    aiAssisted ? 'claude-sonnet-4-6' : null,
  })
  if (error) throw error
  return data
}

/** 사고 종료 — 완료 후 FIRE.BRAIN 지식 추출 자동 트리거 */
export async function closeIncident(incidentId, actorId, finalReport, casualties) {
  const { data, error } = await supabase.rpc('action_close_incident', {
    p_incident_id:  incidentId,
    p_actor_id:     actorId,
    p_final_report: finalReport,
    p_casualties:   casualties,
  })
  if (error) throw error

  // 종료 성공 시 지식 추출 자동 트리거 (비동기)
  if (data?.ok) {
    triggerKnowledgeExtraction(incidentId).catch(() => {})
  }

  return data
}

/** FIRE.BRAIN 지식 추출 비동기 트리거 */
async function triggerKnowledgeExtraction(incidentId) {
  const fnUrl = supabaseUrl ? `${supabaseUrl}/functions/v1/knowledge-extractor` : null
  if (!fnUrl) return

  await fetch(fnUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseKey || '',
    },
    body: JSON.stringify({ incident_id: incidentId }),
  })
}

/** AI 코파일럿 쿼리 로그 */
export async function logAiCopilot(incidentId, actorId, query, response, outcome = null) {
  const { data, error } = await supabase.rpc('action_log_ai_copilot', {
    p_incident_id: incidentId,
    p_actor_id:    actorId,
    p_query:       query,
    p_response:    response,
    p_ai_model:    'claude-sonnet-4-6',
    p_outcome:     outcome,
  })
  if (error) throw error
  return data
}

// ── 조회 함수 ────────────────────────────────────────────────

export async function getActiveIncidents() {
  const { data, error } = await supabase
    .from('v_active_incidents')
    .select('*')
    .order('reported_at', { ascending: false })
  if (error) throw error
  return data
}

export async function getStationResources() {
  const { data, error } = await supabase
    .from('v_station_resources')
    .select('*')
    .order('name')
  if (error) throw error
  return data
}

export async function getIncidentWithLogs(incidentId) {
  const [incidentRes, logsRes, dispatchesRes] = await Promise.all([
    supabase.from('incidents').select('*, buildings(*), personnel!incidents_commander_id_fkey(*)').eq('id', incidentId).single(),
    supabase.from('tactical_logs').select('*, personnel(name, rank)').eq('incident_id', incidentId).order('created_at', { ascending: true }),
    supabase.from('dispatches').select('*, vehicles(call_sign, vehicle_type, status)').eq('incident_id', incidentId),
  ])
  if (incidentRes.error) throw incidentRes.error
  return {
    incident:   incidentRes.data,
    logs:       logsRes.data || [],
    dispatches: dispatchesRes.data || [],
  }
}

export async function getStandbyVehicles(stationId = null) {
  let q = supabase.from('vehicles').select('*, stations(name, short_name)').eq('status', 'standby')
  if (stationId) q = q.eq('station_id', stationId)
  const { data, error } = await q.order('call_sign')
  if (error) throw error
  return data
}

export async function getAllVehicles() {
  const { data, error } = await supabase
    .from('vehicles')
    .select('*, stations(name, short_name)')
    .order('station_id')
  if (error) throw error
  return data
}

/** 최근 알림 조회 */
export async function getRecentNotifications(limit = 20) {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data
}
