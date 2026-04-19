import { useState } from 'react'
import './BuildingBrief.css'

const TYPE_LABEL = {
  '공장':        { icon: '🏭', color: 'var(--danger)' },
  '상업':        { icon: '🏬', color: 'var(--info)' },
  '주거':        { icon: '🏢', color: 'var(--success)' },
  '창고':        { icon: '🏗️', color: 'var(--warn)' },
  '의료':        { icon: '🏥', color: '#a78bfa' },
}

const TACTICAL_BRIEF = {
  '공장':  {
    fire:   ['위험물 종류·위치 즉시 확인', '방호복·공기호흡기 착용 필수', '배수로 오염방지 설치', '풍상측 진입'],
    hazmat: ['CBRN 대응팀 요청', '반경 300m 경계 설정', '현장지휘소 풍상 500m'],
    rescue: ['위험물 구역 접근 전 탐지기 확인'],
  },
  '창고':  {
    fire:   ['대공간 열기류 유의 — 급격한 화세 확산 가능', '리튬배터리/에어로졸 위치 확인', '스프링클러 배수 과부하 주의', '자동문 잠금 해제'],
    rescue: ['반출입구 통한 진입', '야간 근무자 인원 파악'],
    ems:    ['열사병·연기흡입 처치 준비'],
  },
  '주거':  {
    fire:   ['드라이비트 외벽 화염 확산 경로 확인', '고가사다리 접근로 확보', '엘리베이터 점령 (지휘차)', '비상구 전층 확인', '상층 연기 농도 우선 확인'],
    rescue: ['장애인·노인 층별 위치 확인', '엘리베이터 구조 준비'],
    ems:    ['연기흡입 환자 대거 발생 대비'],
  },
  '상업':  {
    fire:   ['관람객·방문자 대피 유도 최우선', '비상구 위치 사전 파악', '지하주차장 연기 축적 주의', '패닉 통제'],
    rescue: ['지하층 진입 시 환기 상태 확인'],
    ems:    ['트라우마·부상자 집결지 지정'],
  },
  '의료':  {
    fire:   ['이동불가 환자 층별 파악 즉시', '수직 대피 (환자 병실→계단)', '의료가스 차단 여부 확인', '구급차 추가 요청'],
    rescue: ['ICU·중환자 최우선 구조', '헬기 착륙장 활용 검토'],
    ems:    ['의료진 협력 현장 응급처치', '수용가능 병원 사전 파악'],
  },
}

function getInspectionStatus(lastInspection) {
  if (!lastInspection) return { label: '점검 기록 없음', cls: 'stale-red' }
  const months = (Date.now() - new Date(lastInspection)) / (1000 * 60 * 60 * 24 * 30)
  if (months < 3)  return { label: `최근 점검 (${Math.floor(months)}개월 전)`, cls: 'stale-green' }
  if (months < 12) return { label: `${Math.floor(months)}개월 전 점검`, cls: 'stale-yellow' }
  return { label: `${Math.floor(months / 12)}년 이상 경과`, cls: 'stale-red' }
}

export default function BuildingBrief({ building, incidentType = 'fire' }) {
  const [expanded, setExpanded] = useState(false)

  if (!building) return null

  const typeInfo    = TYPE_LABEL[building.building_type] || { icon: '🏠', color: 'var(--text2)' }
  const inspStatus  = getInspectionStatus(building.last_inspection)
  const tactics     = (TACTICAL_BRIEF[building.building_type] || {})[incidentType] || []

  return (
    <div className="card building-brief-card">
      {/* ── 헤더 */}
      <div className="bb-header">
        <div className="bb-title-wrap">
          <span className="bb-icon">{typeInfo.icon}</span>
          <div>
            <div className="bb-name">{building.name}</div>
            <div className="bb-address">{building.address}</div>
          </div>
        </div>
        <span className="bb-type-badge" style={{ borderColor: typeInfo.color, color: typeInfo.color }}>
          {building.building_type}
        </span>
      </div>

      {/* ── Layer A: 즉시 확인 정보 (항상 표시) */}
      <div className="bb-layer-a">
        <div className="bb-stat">
          <span className="bb-stat-label">층수</span>
          <span className="bb-stat-value">지상 {building.floors_above}F / 지하 {building.floors_below}F</span>
        </div>
        {building.total_area_m2 && (
          <div className="bb-stat">
            <span className="bb-stat-label">연면적</span>
            <span className="bb-stat-value">{building.total_area_m2.toLocaleString()}㎡</span>
          </div>
        )}
        <div className="bb-stat">
          <span className="bb-stat-label">스프링클러</span>
          <span className={`bb-badge ${building.has_sprinkler ? 'badge-ok' : 'badge-warn'}`}>
            {building.has_sprinkler ? '✓ 설치' : '✗ 미설치'}
          </span>
        </div>
        <div className="bb-stat">
          <span className="bb-stat-label">위험물</span>
          <span className={`bb-badge ${building.has_hazmat ? 'badge-danger' : 'badge-ok'}`}>
            {building.has_hazmat ? '⚠ 있음' : '없음'}
          </span>
        </div>
        {building.hydrant_distance_m != null && (
          <div className="bb-stat">
            <span className="bb-stat-label">소화전</span>
            <span className={`bb-badge ${building.hydrant_distance_m <= 30 ? 'badge-ok' : 'badge-warn'}`}>
              {building.hydrant_distance_m}m
            </span>
          </div>
        )}
        <div className="bb-stat">
          <span className="bb-stat-label">최종 점검</span>
          <span className={`bb-stale ${inspStatus.cls}`}>{inspStatus.label}</span>
        </div>
      </div>

      {/* ── 위험물 경고 (있을 경우) */}
      {building.has_hazmat && building.hazmat_info && (
        <div className="bb-hazmat-alert">
          <span className="bb-hazmat-icon">☢</span>
          <span>{building.hazmat_info}</span>
        </div>
      )}

      {/* ── 전술 권고 */}
      {tactics.length > 0 && (
        <div className="bb-tactics">
          <div className="bb-tactics-label">⚡ 전술 권고 ({building.building_type}·{incidentType === 'fire' ? '화재' : incidentType === 'rescue' ? '구조' : '구급'})</div>
          <ul className="bb-tactics-list">
            {tactics.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </div>
      )}

      {/* ── Layer B: 상세 정보 (토글) */}
      <button className="bb-expand-btn" onClick={() => setExpanded(!expanded)}>
        {expanded ? '▲ 상세 정보 접기' : '▼ 상세 정보 펼치기'}
      </button>

      {expanded && (
        <div className="bb-layer-b">
          {building.special_notes && (
            <div className="bb-notes">
              <div className="bb-notes-label">📋 특이사항 · 비상연락</div>
              <div className="bb-notes-content">{building.special_notes}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
