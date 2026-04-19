-- ============================================================
-- FIRE-PALANTIR: 소방 온톨로지 핵심 스키마 v1.0
-- 팔란티어 Foundry Ontology 패턴을 공개 기술로 구현
-- ============================================================

-- ── 확장 ────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ============================================================
-- OBJECT TYPES (온톨로지 핵심 객체)
-- ============================================================

-- ── Station (소방서/센터) ────────────────────────────────────
create table if not exists stations (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  short_name  text not null,          -- 덕진, 금암, 전미
  district    text not null,          -- 덕진구, 완산구
  address     text not null,
  lat         double precision not null,
  lon         double precision not null,
  phone       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ── Building (건물) ──────────────────────────────────────────
create table if not exists buildings (
  id                  uuid primary key default uuid_generate_v4(),
  name                text,
  address             text not null,
  lat                 double precision not null,
  lon                 double precision not null,
  building_type       text not null,    -- 주거/상업/공장/의료/학교
  floors_above        int default 1,
  floors_below        int default 0,
  total_area_m2       numeric,
  has_sprinkler       boolean default false,
  has_hazmat          boolean default false,
  hazmat_info         text,
  hydrant_distance_m  int,              -- 가장 가까운 소화전 거리(m)
  last_inspection     date,
  special_notes       text,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- ── Vehicle (차량) ───────────────────────────────────────────
create table if not exists vehicles (
  id              uuid primary key default uuid_generate_v4(),
  call_sign       text not null unique,  -- '펌프1', '굴절2'
  vehicle_type    text not null,         -- pump/tank/ladder/aerial/amb/command
  plate_number    text,
  station_id      uuid references stations(id),
  status          text not null default 'standby',
  -- standby: 대기 / dispatched: 출동중 / onscene: 현장 / returning: 귀소 / maintenance: 정비
  crew_count      int default 0,
  max_crew        int not null default 4,
  equipment_list  jsonb default '[]',
  lat             double precision,      -- 실시간 GPS
  lon             double precision,
  last_location_at timestamptz,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  check (status in ('standby','dispatched','onscene','returning','maintenance'))
);

-- ── Personnel (인원) ─────────────────────────────────────────
create table if not exists personnel (
  id              uuid primary key default uuid_generate_v4(),
  name            text not null,
  rank            text not null,   -- 소방사/소방교/소방장/소방위/소방경
  role            text not null,   -- firefighter/paramedic/rescue/commander
  station_id      uuid references stations(id),
  vehicle_id      uuid references vehicles(id),   -- 출동 시 배정 차량
  certifications  jsonb default '[]',              -- ['구조사','구급사','화학']
  current_status  text not null default 'on_duty',
  -- on_duty: 근무 / dispatched: 출동중 / off_duty: 휴무
  shift           text,            -- A/B/C/D 교대
  contact_phone   text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  check (current_status in ('on_duty','dispatched','off_duty'))
);

-- ── Incident (사고) ──────────────────────────────────────────
create table if not exists incidents (
  id              uuid primary key default uuid_generate_v4(),
  incident_number text unique,           -- 2024-DK-0001 (연도-관할-순번)
  incident_type   text not null,         -- fire/rescue/ems/hazmat/flood/other
  severity        int not null default 3,  -- 1(경미)~5(대형)
  title           text not null,
  address         text not null,
  lat             double precision not null,
  lon             double precision not null,
  building_id     uuid references buildings(id),
  commander_id    uuid references personnel(id),
  status          text not null default 'pending',
  -- pending: 접수 / dispatched: 출동 / onscene: 현장 / controlled: 통제 / closed: 종료
  reported_at     timestamptz not null default now(),
  dispatched_at   timestamptz,
  arrived_at      timestamptz,
  controlled_at   timestamptz,
  closed_at       timestamptz,
  caller_info     text,
  initial_report  text,
  final_report    text,
  casualties      jsonb default '{"injured":0,"deceased":0,"rescued":0}',
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  check (severity between 1 and 5),
  check (status in ('pending','dispatched','onscene','controlled','closed'))
);

-- ── Dispatch (출동 배정 — Incident ↔ Vehicle 연결) ───────────
create table if not exists dispatches (
  id              uuid primary key default uuid_generate_v4(),
  incident_id     uuid not null references incidents(id),
  vehicle_id      uuid not null references vehicles(id),
  dispatched_by   uuid references personnel(id),
  dispatched_at   timestamptz not null default now(),
  arrived_at      timestamptz,
  released_at     timestamptz,
  role_at_scene   text,    -- 지휘차/주수/진입/구조/구급
  notes           text
);

-- ── TacticalLog (전술 로그 — 감사 추적 핵심) ─────────────────
create table if not exists tactical_logs (
  id              uuid primary key default uuid_generate_v4(),
  incident_id     uuid not null references incidents(id),
  actor_id        uuid references personnel(id),   -- 행동한 사람
  action_type     text not null,
  -- dispatch_vehicle / update_status / close_incident /
  -- ai_copilot_query / manual_entry / resource_request
  content         text not null,                   -- 로그 내용
  metadata        jsonb default '{}',              -- 추가 구조화 데이터
  ai_assisted     boolean default false,           -- AI 개입 여부
  ai_model        text,                            -- 사용 AI 모델
  outcome         text,                            -- 결과/효과
  created_at      timestamptz default now()
);

-- ============================================================
-- ACTION TYPES (팔란티어 패턴: 모든 쓰기는 검증+로그 포함)
-- DB 함수로 구현 — 클라이언트는 직접 테이블 수정 불가
-- ============================================================

-- ── Action: 출동 명령 ─────────────────────────────────────────
create or replace function action_dispatch_vehicle(
  p_vehicle_id    uuid,
  p_incident_id   uuid,
  p_commander_id  uuid,
  p_role          text default null
) returns jsonb language plpgsql security definer as $$
declare
  v_vehicle   vehicles%rowtype;
  v_incident  incidents%rowtype;
  v_dispatch  uuid;
begin
  -- 검증 1: 차량 존재 및 대기 상태
  select * into v_vehicle from vehicles where id = p_vehicle_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', '차량을 찾을 수 없습니다');
  end if;
  if v_vehicle.status != 'standby' then
    return jsonb_build_object('ok', false, 'error',
      format('차량 %s 현재 상태: %s (대기 상태가 아닙니다)', v_vehicle.call_sign, v_vehicle.status));
  end if;

  -- 검증 2: 사고 존재 및 활성 상태
  select * into v_incident from incidents where id = p_incident_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', '사고를 찾을 수 없습니다');
  end if;
  if v_incident.status = 'closed' then
    return jsonb_build_object('ok', false, 'error', '이미 종료된 사고입니다');
  end if;

  -- 실행: 차량 상태 변경
  update vehicles set
    status = 'dispatched',
    updated_at = now()
  where id = p_vehicle_id;

  -- 실행: 사고 상태 업데이트 (최초 출동 시)
  if v_incident.status = 'pending' then
    update incidents set
      status = 'dispatched',
      dispatched_at = now(),
      commander_id = coalesce(commander_id, p_commander_id),
      updated_at = now()
    where id = p_incident_id;
  end if;

  -- 실행: Dispatch 레코드 생성
  insert into dispatches (incident_id, vehicle_id, dispatched_by, role_at_scene)
  values (p_incident_id, p_vehicle_id, p_commander_id, p_role)
  returning id into v_dispatch;

  -- 감사 로그
  insert into tactical_logs (incident_id, actor_id, action_type, content, metadata)
  values (
    p_incident_id,
    p_commander_id,
    'dispatch_vehicle',
    format('%s 출동 명령', v_vehicle.call_sign),
    jsonb_build_object(
      'vehicle_id', p_vehicle_id,
      'vehicle_call_sign', v_vehicle.call_sign,
      'dispatch_id', v_dispatch,
      'role', p_role
    )
  );

  return jsonb_build_object(
    'ok', true,
    'dispatch_id', v_dispatch,
    'vehicle', v_vehicle.call_sign,
    'message', format('%s 출동 명령 완료', v_vehicle.call_sign)
  );
end;
$$;

-- ── Action: 상황 상태 업데이트 ───────────────────────────────
create or replace function action_update_incident_status(
  p_incident_id   uuid,
  p_status        text,
  p_note          text,
  p_actor_id      uuid,
  p_ai_assisted   boolean default false,
  p_ai_model      text default null
) returns jsonb language plpgsql security definer as $$
declare
  v_incident incidents%rowtype;
  valid_statuses text[] := array['pending','dispatched','onscene','controlled','closed'];
begin
  -- 검증
  if not (p_status = any(valid_statuses)) then
    return jsonb_build_object('ok', false, 'error', '유효하지 않은 상태값입니다');
  end if;

  select * into v_incident from incidents where id = p_incident_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', '사고를 찾을 수 없습니다');
  end if;

  -- 실행: 상태 업데이트 + 타임스탬프 기록
  update incidents set
    status = p_status,
    arrived_at   = case when p_status = 'onscene'    and arrived_at is null   then now() else arrived_at end,
    controlled_at= case when p_status = 'controlled' and controlled_at is null then now() else controlled_at end,
    updated_at = now()
  where id = p_incident_id;

  -- 감사 로그
  insert into tactical_logs (incident_id, actor_id, action_type, content, ai_assisted, ai_model)
  values (
    p_incident_id,
    p_actor_id,
    'update_status',
    format('[%s → %s] %s', v_incident.status, p_status, p_note),
    p_ai_assisted,
    p_ai_model
  );

  return jsonb_build_object('ok', true, 'new_status', p_status);
end;
$$;

-- ── Action: 사고 종료 ────────────────────────────────────────
create or replace function action_close_incident(
  p_incident_id   uuid,
  p_actor_id      uuid,
  p_final_report  text,
  p_casualties    jsonb default '{"injured":0,"deceased":0,"rescued":0}'
) returns jsonb language plpgsql security definer as $$
declare
  v_incident incidents%rowtype;
  v_active_vehicles int;
begin
  select * into v_incident from incidents where id = p_incident_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', '사고를 찾을 수 없습니다');
  end if;
  if v_incident.status = 'closed' then
    return jsonb_build_object('ok', false, 'error', '이미 종료된 사고입니다');
  end if;

  -- 검증: 현장 차량 모두 귀소 확인 (경고만, 강제 차단은 안 함)
  select count(*) into v_active_vehicles
  from dispatches d
  join vehicles v on v.id = d.vehicle_id
  where d.incident_id = p_incident_id
    and d.released_at is null
    and v.status in ('dispatched','onscene');

  -- 실행: 사고 종료
  update incidents set
    status = 'closed',
    closed_at = now(),
    final_report = p_final_report,
    casualties = p_casualties,
    updated_at = now()
  where id = p_incident_id;

  -- 배정 차량 전체 귀소 처리
  update dispatches set released_at = now()
  where incident_id = p_incident_id and released_at is null;

  update vehicles set status = 'returning', updated_at = now()
  where id in (
    select vehicle_id from dispatches where incident_id = p_incident_id
  ) and status in ('dispatched','onscene');

  -- 감사 로그
  insert into tactical_logs (incident_id, actor_id, action_type, content, metadata)
  values (
    p_incident_id,
    p_actor_id,
    'close_incident',
    format('사고 종료: %s', p_final_report),
    jsonb_build_object(
      'casualties', p_casualties,
      'active_vehicles_at_close', v_active_vehicles,
      'knowledge_extraction_pending', true   -- FIRE.BRAIN 트리거 신호
    )
  );

  return jsonb_build_object(
    'ok', true,
    'incident_id', p_incident_id,
    'warning', case when v_active_vehicles > 0
      then format('주의: 미귀소 차량 %s대가 있었습니다', v_active_vehicles)
      else null end,
    'message', '사고 종료 완료. 지식 추출 파이프라인 트리거됨'
  );
end;
$$;

-- ── Action: AI 코파일럿 쿼리 로그 ────────────────────────────
create or replace function action_log_ai_copilot(
  p_incident_id   uuid,
  p_actor_id      uuid,
  p_query         text,
  p_response      text,
  p_ai_model      text,
  p_outcome       text default null
) returns uuid language plpgsql security definer as $$
declare
  v_log_id uuid;
begin
  insert into tactical_logs (incident_id, actor_id, action_type, content, metadata, ai_assisted, ai_model, outcome)
  values (
    p_incident_id,
    p_actor_id,
    'ai_copilot_query',
    p_response,
    jsonb_build_object('query', p_query),
    true,
    p_ai_model,
    p_outcome
  )
  returning id into v_log_id;

  return v_log_id;
end;
$$;

-- ============================================================
-- 인덱스
-- ============================================================
create index if not exists idx_incidents_status on incidents(status);
create index if not exists idx_incidents_type on incidents(incident_type);
create index if not exists idx_vehicles_status on vehicles(status);
create index if not exists idx_vehicles_station on vehicles(station_id);
create index if not exists idx_tactical_logs_incident on tactical_logs(incident_id);
create index if not exists idx_tactical_logs_created on tactical_logs(created_at desc);
create index if not exists idx_dispatches_incident on dispatches(incident_id);
create index if not exists idx_personnel_station on personnel(station_id);

-- ============================================================
-- VIEW: 운영 대시보드용 요약 뷰
-- ============================================================

-- 현재 활성 사고 + 투입 차량 수
create or replace view v_active_incidents as
select
  i.id,
  i.incident_number,
  i.incident_type,
  i.severity,
  i.title,
  i.address,
  i.lat,
  i.lon,
  i.status,
  i.reported_at,
  i.dispatched_at,
  i.arrived_at,
  p.name as commander_name,
  p.rank as commander_rank,
  count(d.id) as vehicle_count,
  extract(epoch from (now() - i.reported_at))/60 as elapsed_minutes
from incidents i
left join personnel p on p.id = i.commander_id
left join dispatches d on d.incident_id = i.id and d.released_at is null
where i.status != 'closed'
group by i.id, p.name, p.rank;

-- 소방서별 자원 현황
create or replace view v_station_resources as
select
  s.id,
  s.name,
  s.short_name,
  s.district,
  s.lat,
  s.lon,
  count(v.id) filter (where v.status = 'standby') as vehicles_standby,
  count(v.id) filter (where v.status = 'dispatched') as vehicles_dispatched,
  count(v.id) filter (where v.status = 'onscene') as vehicles_onscene,
  count(v.id) filter (where v.status = 'returning') as vehicles_returning,
  count(v.id) as vehicles_total,
  count(per.id) filter (where per.current_status = 'on_duty') as personnel_on_duty,
  count(per.id) filter (where per.current_status = 'dispatched') as personnel_dispatched
from stations s
left join vehicles v on v.station_id = s.id
left join personnel per on per.station_id = s.id
group by s.id;
