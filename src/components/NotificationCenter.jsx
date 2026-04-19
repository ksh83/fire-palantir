import { useState, useEffect, useRef } from 'react'
import { supabase, getRecentNotifications } from '../lib/supabase'
import './NotificationCenter.css'

const TYPE_LABEL = {
  safepass:          { icon: '🚦', label: 'SafePass' },
  sms_police:        { icon: '👮', label: '경찰 문자' },
  kakao_commander:   { icon: '📱', label: '지휘관' },
  kakao_field:       { icon: '🚒', label: '현장대원' },
  kakao_dispatch:    { icon: '📡', label: '상황실' },
}

const STATUS_CLASS = {
  sent:      'status-sent',
  simulated: 'status-sim',
  pending:   'status-pending',
  failed:    'status-failed',
}

const STATUS_LABEL = {
  sent:      '전송',
  simulated: '시뮬',
  pending:   '대기',
  failed:    '실패',
}

function timeAgo(ts) {
  const diff = (Date.now() - new Date(ts).getTime()) / 1000
  if (diff < 60)   return `${Math.floor(diff)}초 전`
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`
  return `${Math.floor(diff / 3600)}시간 전`
}

export default function NotificationCenter() {
  const [open,  setOpen]  = useState(false)
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const panelRef = useRef(null)

  const isConfigured = !!import.meta.env.VITE_SUPABASE_URL

  async function load() {
    if (!isConfigured) return
    const data = await getRecentNotifications(30).catch(() => [])
    setItems(data || [])
  }

  useEffect(() => {
    load()
    if (!isConfigured) return

    const ch = supabase
      .channel('notifications-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
        setItems(prev => [payload.new, ...prev.slice(0, 29)])
        if (!open) setUnread(n => n + 1)
      })
      .subscribe()

    return () => supabase.removeChannel(ch)
  }, [])

  useEffect(() => {
    if (open) setUnread(0)
  }, [open])

  // 패널 외부 클릭 시 닫기
  useEffect(() => {
    function handleClick(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div className="notif-wrapper" ref={panelRef}>
      <button className="notif-bell" onClick={() => setOpen(v => !v)} title="알림 센터">
        <span className="bell-icon">🔔</span>
        {unread > 0 && <span className="notif-badge">{unread}</span>}
      </button>

      {open && (
        <div className="notif-panel">
          <div className="notif-header">
            <span className="notif-title">알림 센터</span>
            <span className="notif-sub">SafePass · KakaoTalk</span>
          </div>

          {!isConfigured && (
            <div className="notif-empty">Supabase 연결 후 알림이 표시됩니다</div>
          )}

          {isConfigured && items.length === 0 && (
            <div className="notif-empty">출동 명령 시 알림이 자동 생성됩니다</div>
          )}

          <div className="notif-list">
            {items.map(item => {
              const meta = TYPE_LABEL[item.notification_type] || { icon: '📨', label: item.notification_type }
              return (
                <div key={item.id} className="notif-item">
                  <div className="notif-icon">{meta.icon}</div>
                  <div className="notif-body">
                    <div className="notif-row1">
                      <span className="notif-type">{meta.label}</span>
                      <span className={`notif-status ${STATUS_CLASS[item.status] || ''}`}>
                        {STATUS_LABEL[item.status] || item.status}
                      </span>
                    </div>
                    <div className="notif-title-text">{item.title}</div>
                    <div className="notif-msg">{item.message}</div>
                    <div className="notif-time">{timeAgo(item.created_at)}</div>
                  </div>
                </div>
              )
            })}
          </div>

          {items.some(i => i.status === 'simulated') && (
            <div className="notif-footer">
              시뮬 상태: SafePass / KakaoTalk API 키 설정 시 실제 전송
            </div>
          )}
        </div>
      )}
    </div>
  )
}
