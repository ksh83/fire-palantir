-- ============================================================
-- FIRE-PALANTIR: 운영 자동화 알림 시스템 v1.0
-- SafePass 연동 + KakaoTalk 역할별 차등 알림
-- ============================================================

-- ── 알림 로그 테이블 ──────────────────────────────────────────
create table if not exists notifications (
  id               uuid primary key default uuid_generate_v4(),
  incident_id      uuid references incidents(id),
  vehicle_id       uuid references vehicles(id),
  notification_type text not null,
  -- safepass / kakao_commander / kakao_field / kakao_dispatch / sms_police
  recipient        text,              -- 수신자 (전화번호 또는 채널)
  recipient_role   text,              -- commander / field / dispatch
  title            text not null,
  message          text not null,
  status           text not null default 'pending',
  -- pending / sent / failed / simulated (API 미연결 시 시뮬레이션)
  provider_response jsonb,
  sent_at          timestamptz,
  created_at       timestamptz default now()
);

create index if not exists idx_notifications_incident on notifications(incident_id);
create index if not exists idx_notifications_created  on notifications(created_at desc);
create index if not exists idx_notifications_status   on notifications(status);

-- ── SafePass 출동 경로 교차로 기록 ───────────────────────────
create table if not exists safepass_requests (
  id               uuid primary key default uuid_generate_v4(),
  incident_id      uuid references incidents(id),
  vehicle_id       uuid references vehicles(id),
  vehicle_call_sign text,
  route_description text,
  intersections    jsonb default '[]',  -- 교차로 목록
  status           text not null default 'pending',
  -- pending / approved / simulated / failed
  provider_response jsonb,
  requested_at     timestamptz default now()
);

-- ── 알림 통계 뷰 ──────────────────────────────────────────────
create or replace view v_notification_stats as
select
  date_trunc('day', created_at) as day,
  notification_type,
  status,
  count(*) as count
from notifications
group by 1, 2, 3;
