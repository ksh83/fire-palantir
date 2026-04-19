import { useState, useEffect } from 'react'
import './CameraGrid.css'

const VEHICLE_TYPE_KR = {
  pump: '펌프', tank: '탱크', aerial: '고가', ladder: '굴절',
  rescue: '구조', amb: '구급', command: '지휘',
}

// 차량 유형별 열화상 씬
const SCENE_TYPE = {
  pump:    'scene-fire',
  tank:    'scene-fire',
  aerial:  'scene-aerial',
  ladder:  'scene-aerial',
  rescue:  'scene-interior',
  amb:     'scene-interior',
  command: 'scene-command',
}

function ThermalFeed({ vehicleType, callSign, active }) {
  const scene = SCENE_TYPE[vehicleType] || 'scene-fire'
  // 콜사인 기반 seed → 열원 위치 일관성 유지
  const seed = callSign.charCodeAt(0) + (callSign.charCodeAt(1) || 0)
  const ox = 20 + (seed % 40)
  const oy = 20 + ((seed * 3) % 40)

  return (
    <div className={`thermal-feed ${scene} ${active ? 'active' : ''}`}>
      <div className="thermal-heat-source"
        style={{ left: `${ox}%`, top: `${oy}%` }} />
      {scene === 'scene-fire' && (
        <>
          <div className="thermal-flame" style={{ left: `${ox + 5}%`, top: `${oy - 10}%` }} />
          <div className="thermal-smoke" />
        </>
      )}
      {scene === 'scene-aerial' && (
        <div className="thermal-ground-grid" />
      )}
      {scene === 'scene-interior' && (
        <div className="thermal-spotlight"
          style={{ left: `${ox}%`, top: `${oy}%` }} />
      )}
      <div className="thermal-noise" />
      <div className="thermal-scanlines" />
      {/* HUD 오버레이 */}
      <div className="thermal-hud">
        <div className="hud-top">
          <span className="hud-mode">
            {scene === 'scene-aerial' ? 'AERIAL' : scene === 'scene-interior' ? 'IR' : 'THERMAL'}
          </span>
          <LiveTimestamp />
        </div>
        <div className="hud-bottom">
          <span className="hud-temp">
            {scene === 'scene-fire' ? '🔴 MAX 620°C' : scene === 'scene-interior' ? '🟡 85°C' : '🟢 45°C'}
          </span>
          <span className="hud-coords">35.865°N 127.138°E</span>
        </div>
      </div>
      {!active && <div className="thermal-offline">SIGNAL LOST</div>}
    </div>
  )
}

function LiveTimestamp() {
  const [t, setT] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <span className="hud-time">
      {t.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </span>
  )
}

export default function CameraGrid({ dispatches }) {
  const [expanded, setExpanded] = useState(null) // callsign or null

  const vehicles = dispatches
    .filter(d => d.vehicles?.status === 'onscene' || d.vehicles?.status === 'dispatched')
    .slice(0, 6)

  if (vehicles.length === 0) return null

  const expandedVehicle = expanded ? vehicles.find(d => d.vehicles?.call_sign === expanded) : null

  return (
    <div className="card camera-grid-card">
      <div className="card-header">
        <span className="card-title">
          <span className="cam-live-dot" /> 차량 카메라 현황
        </span>
        <span className="cam-badge">
          {vehicles.length}대 · 라이브 시뮬레이션
        </span>
      </div>

      {/* 확대 뷰 */}
      {expandedVehicle && (
        <div className="cam-expanded">
          <div className="cam-expanded-header">
            <span className="cam-expanded-label">
              [{VEHICLE_TYPE_KR[expandedVehicle.vehicles?.vehicle_type]}]&nbsp;
              {expandedVehicle.vehicles?.call_sign}
            </span>
            <button className="cam-close" onClick={() => setExpanded(null)}>✕ 닫기</button>
          </div>
          <ThermalFeed
            vehicleType={expandedVehicle.vehicles?.vehicle_type}
            callSign={expandedVehicle.vehicles?.call_sign}
            active
          />
        </div>
      )}

      {/* 썸네일 그리드 */}
      <div className={`cam-grid cam-grid-${Math.min(vehicles.length, 4)}`}>
        {vehicles.map(d => (
          <div
            key={d.id}
            className={`cam-tile ${expanded === d.vehicles?.call_sign ? 'cam-tile-selected' : ''}`}
            onClick={() => setExpanded(
              expanded === d.vehicles?.call_sign ? null : d.vehicles?.call_sign
            )}
          >
            <ThermalFeed
              vehicleType={d.vehicles?.vehicle_type}
              callSign={d.vehicles?.call_sign || ''}
              active={d.vehicles?.status === 'onscene'}
            />
            <div className="cam-tile-label">
              <span className={`cam-status-dot ${d.vehicles?.status === 'onscene' ? 'dot-live' : 'dot-transit'}`} />
              <span>{d.vehicles?.call_sign}</span>
              <span className="cam-tile-type">{VEHICLE_TYPE_KR[d.vehicles?.vehicle_type]}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="cam-note">
        ※ 실제 운영 시 119상황실 차량 CCTV 피드 통합 표시
      </div>
    </div>
  )
}
