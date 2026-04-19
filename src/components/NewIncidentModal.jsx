import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import './NewIncidentModal.css'

const INCIDENT_TYPES = [
  { value: 'fire',   label: '화재',     icon: '🔥' },
  { value: 'rescue', label: '구조',     icon: '🚨' },
  { value: 'ems',    label: '구급',     icon: '🚑' },
  { value: 'hazmat', label: '화학',     icon: '☢️' },
  { value: 'flood',  label: '수해',     icon: '🌊' },
  { value: 'other',  label: '기타',     icon: '📋' },
]

// 전주덕진 관할 주요 주소 자동완성
const ADDRESS_PRESETS = [
  '전북 전주시 덕진구 인후동 1가',
  '전북 전주시 덕진구 금암동',
  '전북 전주시 덕진구 전미동',
  '전북 전주시 덕진구 팔복동 팔복산업단지',
  '전북 전주시 덕진구 여의동 1가',
  '전북 전주시 덕진구 우아동',
]

export default function NewIncidentModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    incident_type: 'fire',
    severity:       3,
    title:          '',
    address:        '',
    initial_report: '',
    commander_id:   '',
    building_id:    '',
  })
  const [commanders, setCommanders] = useState([])
  const [buildings,  setBuildings]  = useState([])
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState(null)

  useEffect(() => {
    supabase
      .from('personnel')
      .select('id, name, rank, role')
      .in('role', ['commander', 'firefighter'])
      .eq('current_status', 'on_duty')
      .order('rank')
      .then(({ data }) => setCommanders(data || []))

    supabase
      .from('buildings')
      .select('id, name, address, building_type, has_hazmat')
      .order('name')
      .then(({ data }) => setBuildings(data || []))
  }, [])

  // 유형 선택 시 제목 자동 완성
  function handleTypeChange(type) {
    const label = INCIDENT_TYPES.find(t => t.value === type)?.label || ''
    setForm(prev => ({
      ...prev,
      incident_type: type,
      title: prev.title || `${prev.address ? prev.address.split(' ').slice(-1)[0] + ' ' : ''}${label} 사고`,
    }))
  }

  function handleAddressSelect(addr) {
    const last = addr.split(' ').slice(-1)[0]
    const label = INCIDENT_TYPES.find(t => t.value === form.incident_type)?.label || ''
    setForm(prev => ({
      ...prev,
      address: addr,
      title: prev.title || `${last} ${label} 사고`,
    }))
  }

  function handleBuildingSelect(buildingId) {
    const b = buildings.find(b => b.id === buildingId)
    setForm(prev => ({
      ...prev,
      building_id: buildingId,
      address: b ? b.address : prev.address,
      title: b
        ? `${b.name} ${INCIDENT_TYPES.find(t => t.value === prev.incident_type)?.label || '사고'}`
        : prev.title,
    }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.title || !form.address) {
      setError('제목과 위치는 필수입니다')
      return
    }
    setLoading(true)
    setError(null)

    try {
      // 주소 → 좌표 간이 변환 (전주 중심 기본값)
      const lat = 35.844 + (Math.random() - 0.5) * 0.05
      const lon = 127.107 + (Math.random() - 0.5) * 0.06

      const { data, error: err } = await supabase
        .from('incidents')
        .insert({
          incident_type:   form.incident_type,
          severity:        form.severity,
          title:           form.title,
          address:         form.address,
          lat,
          lon,
          initial_report:  form.initial_report || null,
          commander_id:    form.commander_id || null,
          building_id:     form.building_id   || null,
          incident_number: `${new Date().getFullYear()}-DK-${String(Date.now()).slice(-4)}`,
        })
        .select()
        .single()

      if (err) throw err
      onCreated(data.id)
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <div className="modal-header">
          <h2 className="modal-title">신규 사고 접수</h2>
          <button className="btn btn-ghost" style={{ padding: '4px 8px' }} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="incident-form">
          {/* 사고 유형 */}
          <div className="form-group">
            <label className="form-label">사고 유형</label>
            <div className="type-grid">
              {INCIDENT_TYPES.map(t => (
                <button
                  key={t.value}
                  type="button"
                  className={`type-btn ${form.incident_type === t.value ? 'selected' : ''}`}
                  onClick={() => handleTypeChange(t.value)}
                >
                  <span className="type-icon">{t.icon}</span>
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 위험도 */}
          <div className="form-group">
            <label className="form-label">
              위험도
              <span className={`sev-badge sev-${form.severity}`}>
                {'★'.repeat(form.severity)} {form.severity}단계
              </span>
            </label>
            <input
              type="range" min="1" max="5" step="1"
              value={form.severity}
              onChange={e => setForm(p => ({ ...p, severity: +e.target.value }))}
              className="severity-slider"
            />
            <div className="sev-labels">
              <span>1 경미</span><span>3 보통</span><span>5 대형</span>
            </div>
          </div>

          {/* 건물 선택 (건물 온톨로지 연동) */}
          <div className="form-group">
            <label className="form-label">건물 선택 <span style={{color:'var(--text3)', fontWeight:400}}>(건물 정보 자동 연동)</span></label>
            <select
              className="select"
              value={form.building_id}
              onChange={e => handleBuildingSelect(e.target.value)}
            >
              <option value="">건물 선택 (선택사항)</option>
              {buildings.map(b => (
                <option key={b.id} value={b.id}>
                  {b.has_hazmat ? '⚠ ' : ''}{b.name} ({b.building_type})
                </option>
              ))}
            </select>
          </div>

          {/* 위치 */}
          <div className="form-group">
            <label className="form-label">위치 <span className="required">*</span></label>
            <input
              className="input"
              placeholder="사고 주소 입력..."
              value={form.address}
              onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
              list="address-presets"
            />
            <datalist id="address-presets">
              {ADDRESS_PRESETS.map(a => <option key={a} value={a} />)}
            </datalist>
          </div>

          {/* 사고명 */}
          <div className="form-group">
            <label className="form-label">사고명 <span className="required">*</span></label>
            <input
              className="input"
              placeholder="예: 인후동 아파트 화재"
              value={form.title}
              onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
            />
          </div>

          {/* 초기 보고 */}
          <div className="form-group">
            <label className="form-label">초기 보고</label>
            <textarea
              className="input textarea"
              rows="3"
              placeholder="신고 내용, 요구조자 현황, 특이사항 등..."
              value={form.initial_report}
              onChange={e => setForm(p => ({ ...p, initial_report: e.target.value }))}
            />
          </div>

          {/* 지휘관 */}
          <div className="form-group">
            <label className="form-label">지휘관 지정</label>
            <select
              className="select"
              value={form.commander_id}
              onChange={e => setForm(p => ({ ...p, commander_id: e.target.value }))}
            >
              <option value="">지휘관 선택 (선택사항)</option>
              {commanders.map(c => (
                <option key={c.id} value={c.id}>{c.rank} {c.name}</option>
              ))}
            </select>
          </div>

          {error && <div className="error-msg">{error}</div>}

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>취소</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? '접수 중...' : '사고 접수'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
