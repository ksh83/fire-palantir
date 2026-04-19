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
-- ============================================================
-- FIRE-PALANTIR: FIRE.BRAIN RAG 인프라 v1.0
-- pgvector 기반 소방 도메인 지식 벡터 검색
-- ============================================================

create extension if not exists vector;

-- ── 지식 아이템 (RAG 검색 대상) ────────────────────────────────
create table if not exists knowledge_items (
  id             uuid primary key default uuid_generate_v4(),
  title          text not null,
  incident_type  text,              -- fire/rescue/ems/hazmat/flood/other
  building_type  text,              -- 주거/상업/공장/고층 등
  content        text not null,     -- 지식 본문 (전술, 교훈, 매뉴얼)
  tags           text[] default '{}',
  source         text not null default 'manual',
  -- manual: 수동 입력 / auto_extracted: 사후 자동 추출 / seed: 초기 시드
  incident_id    uuid references incidents(id),   -- 사후 추출 시 원본 사고
  embedding      vector(1536),       -- text-embedding-ada-002 또는 호환 모델
  created_at     timestamptz default now()
);

-- 벡터 인덱스 (cosine similarity)
create index if not exists idx_knowledge_embedding
  on knowledge_items using ivfflat (embedding vector_cosine_ops)
  with (lists = 50);

create index if not exists idx_knowledge_type   on knowledge_items(incident_type);
create index if not exists idx_knowledge_source on knowledge_items(source);

-- ── 텍스트 기반 유사 검색 함수 (embedding 없을 때 fallback) ────
create or replace function search_knowledge_text(
  p_query        text,
  p_type         text default null,
  p_limit        int  default 3
) returns table(
  id             uuid,
  title          text,
  incident_type  text,
  content        text,
  tags           text[],
  source         text,
  relevance      float
) language sql stable as $$
  select
    id, title, incident_type, content, tags, source,
    ts_rank(
      to_tsvector('simple', title || ' ' || content),
      plainto_tsquery('simple', p_query)
    ) as relevance
  from knowledge_items
  where
    (p_type is null or incident_type = p_type)
    and to_tsvector('simple', title || ' ' || content) @@
        plainto_tsquery('simple', p_query)
  order by relevance desc
  limit p_limit;
$$;

-- ── 벡터 유사 검색 함수 ─────────────────────────────────────────
create or replace function search_knowledge_vector(
  p_embedding    vector(1536),
  p_type         text default null,
  p_limit        int  default 3,
  p_threshold    float default 0.7
) returns table(
  id             uuid,
  title          text,
  incident_type  text,
  content        text,
  tags           text[],
  source         text,
  similarity     float
) language sql stable as $$
  select
    id, title, incident_type, content, tags, source,
    1 - (embedding <=> p_embedding) as similarity
  from knowledge_items
  where
    embedding is not null
    and (p_type is null or incident_type = p_type)
    and 1 - (embedding <=> p_embedding) >= p_threshold
  order by embedding <=> p_embedding
  limit p_limit;
$$;

-- ── 지식 추출 로그 ────────────────────────────────────────────
create table if not exists knowledge_extractions (
  id              uuid primary key default uuid_generate_v4(),
  incident_id     uuid not null references incidents(id),
  status          text not null default 'pending',
  -- pending / processing / completed / failed
  items_extracted int default 0,
  error_message   text,
  created_at      timestamptz default now(),
  completed_at    timestamptz
);
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
-- ============================================================
-- FIRE-PALANTIR: 시드 데이터 — 전주덕진소방서 기준
-- 실제 관할 구역, 가상 인원/차량 데이터
-- ============================================================

-- ── Stations (소방서/센터) ───────────────────────────────────
insert into stations (id, name, short_name, district, address, lat, lon, phone) values
  ('10000000-0000-0000-0000-000000000001', '전주덕진소방서', '덕진', '덕진구',
   '전북 전주시 덕진구 금암동 289-1', 35.8442, 127.1068, '063-220-0119'),
  ('10000000-0000-0000-0000-000000000002', '금암119안전센터', '금암', '덕진구',
   '전북 전주시 덕진구 금암1동', 35.8410, 127.1050, '063-220-0211'),
  ('10000000-0000-0000-0000-000000000003', '전미119안전센터', '전미', '덕진구',
   '전북 전주시 덕진구 전미동', 35.8620, 127.1340, '063-220-0231'),
  ('10000000-0000-0000-0000-000000000004', '아중119안전센터', '아중', '덕진구',
   '전북 전주시 덕진구 아중리', 35.8780, 127.1520, '063-220-0241')
on conflict (id) do nothing;

-- ── Vehicles (차량) ──────────────────────────────────────────
-- 덕진소방서 본서
insert into vehicles (id, call_sign, vehicle_type, plate_number, station_id, status, max_crew, equipment_list, lat, lon) values
  ('20000000-0000-0000-0000-000000000001', '덕진지휘1', 'command', '전북12가1001',
   '10000000-0000-0000-0000-000000000001', 'standby', 2,
   '["지휘장비","통신장비","지도"]', 35.8442, 127.1068),
  ('20000000-0000-0000-0000-000000000002', '덕진펌프1', 'pump', '전북12가1002',
   '10000000-0000-0000-0000-000000000001', 'standby', 5,
   '["호스","관창","방수포","공기호흡기x5"]', 35.8442, 127.1068),
  ('20000000-0000-0000-0000-000000000003', '덕진탱크1', 'tank', '전북12가1003',
   '10000000-0000-0000-0000-000000000001', 'standby', 3,
   '["물탱크10톤","호스","관창"]', 35.8442, 127.1068),
  ('20000000-0000-0000-0000-000000000004', '덕진고가1', 'aerial', '전북12가1004',
   '10000000-0000-0000-0000-000000000001', 'standby', 3,
   '["고가사다리52m","구조장비","조명"]', 35.8442, 127.1068),
  ('20000000-0000-0000-0000-000000000005', '덕진구조1', 'rescue', '전북12가1005',
   '10000000-0000-0000-0000-000000000001', 'standby', 5,
   '["유압구조장비","에어백","로프","절단기"]', 35.8442, 127.1068),
  ('20000000-0000-0000-0000-000000000006', '덕진구급1', 'amb', '전북12가1006',
   '10000000-0000-0000-0000-000000000001', 'standby', 3,
   '["AED","산소","의약품","들것"]', 35.8442, 127.1068),
  ('20000000-0000-0000-0000-000000000007', '덕진구급2', 'amb', '전북12가1007',
   '10000000-0000-0000-0000-000000000001', 'standby', 3,
   '["AED","산소","의약품","들것"]', 35.8442, 127.1068)
on conflict (id) do nothing;

-- 금암안전센터
insert into vehicles (id, call_sign, vehicle_type, plate_number, station_id, status, max_crew, equipment_list, lat, lon) values
  ('20000000-0000-0000-0000-000000000011', '금암펌프1', 'pump', '전북12가2001',
   '10000000-0000-0000-0000-000000000002', 'standby', 5,
   '["호스","관창","방수포","공기호흡기x5"]', 35.8410, 127.1050),
  ('20000000-0000-0000-0000-000000000012', '금암펌프2', 'pump', '전북12가2002',
   '10000000-0000-0000-0000-000000000002', 'standby', 5,
   '["호스","관창","방수포","공기호흡기x5"]', 35.8410, 127.1050),
  ('20000000-0000-0000-0000-000000000013', '금암굴절1', 'ladder', '전북12가2003',
   '10000000-0000-0000-0000-000000000002', 'standby', 3,
   '["굴절사다리30m","구조장비"]', 35.8410, 127.1050),
  ('20000000-0000-0000-0000-000000000014', '금암구급1', 'amb', '전북12가2004',
   '10000000-0000-0000-0000-000000000002', 'standby', 3,
   '["AED","산소","의약품","들것"]', 35.8410, 127.1050)
on conflict (id) do nothing;

-- 전미안전센터
insert into vehicles (id, call_sign, vehicle_type, plate_number, station_id, status, max_crew, equipment_list, lat, lon) values
  ('20000000-0000-0000-0000-000000000021', '전미펌프1', 'pump', '전북12가3001',
   '10000000-0000-0000-0000-000000000003', 'standby', 5,
   '["호스","관창","방수포","공기호흡기x5"]', 35.8620, 127.1340),
  ('20000000-0000-0000-0000-000000000022', '전미탱크1', 'tank', '전북12가3002',
   '10000000-0000-0000-0000-000000000003', 'standby', 3,
   '["물탱크8톤","호스","관창"]', 35.8620, 127.1340),
  ('20000000-0000-0000-0000-000000000023', '전미구급1', 'amb', '전북12가3003',
   '10000000-0000-0000-0000-000000000003', 'standby', 3,
   '["AED","산소","의약품","들것"]', 35.8620, 127.1340)
on conflict (id) do nothing;

-- 아중안전센터
insert into vehicles (id, call_sign, vehicle_type, plate_number, station_id, status, max_crew, equipment_list, lat, lon) values
  ('20000000-0000-0000-0000-000000000031', '아중펌프1', 'pump', '전북12가4001',
   '10000000-0000-0000-0000-000000000004', 'standby', 5,
   '["호스","관창","방수포","공기호흡기x5"]', 35.8780, 127.1520),
  ('20000000-0000-0000-0000-000000000032', '아중구급1', 'amb', '전북12가4002',
   '10000000-0000-0000-0000-000000000004', 'standby', 3,
   '["AED","산소","의약품","들것"]', 35.8780, 127.1520)
on conflict (id) do nothing;

-- ── Personnel (인원) — 덕진소방서 기준 ──────────────────────
insert into personnel (id, name, rank, role, station_id, certifications, current_status, shift) values
  ('30000000-0000-0000-0000-000000000001', '김덕진', '소방경', 'commander',
   '10000000-0000-0000-0000-000000000001',
   '["화재진압","구조","화학"]', 'on_duty', 'A'),
  ('30000000-0000-0000-0000-000000000002', '이금암', '소방위', 'commander',
   '10000000-0000-0000-0000-000000000002',
   '["화재진압","구조"]', 'on_duty', 'A'),
  ('30000000-0000-0000-0000-000000000003', '박전미', '소방장', 'firefighter',
   '10000000-0000-0000-0000-000000000003',
   '["화재진압"]', 'on_duty', 'A'),
  ('30000000-0000-0000-0000-000000000004', '최아중', '소방장', 'firefighter',
   '10000000-0000-0000-0000-000000000004',
   '["화재진압","구급"]', 'on_duty', 'A'),
  ('30000000-0000-0000-0000-000000000005', '정구급', '소방교', 'paramedic',
   '10000000-0000-0000-0000-000000000001',
   '["구급사1급","심폐소생술"]', 'on_duty', 'A'),
  ('30000000-0000-0000-0000-000000000006', '한구조', '소방사', 'rescue',
   '10000000-0000-0000-0000-000000000001',
   '["구조사","로프","수중구조"]', 'on_duty', 'A')
on conflict (id) do nothing;

-- ── Buildings (건물) — 전주시 주요 건물 샘플 ─────────────────
insert into buildings (id, name, address, lat, lon, building_type, floors_above, floors_below, has_sprinkler, has_hazmat) values
  ('40000000-0000-0000-0000-000000000001', '전주 금암아이파크아파트', '전주시 덕진구 금암동 455',
   35.8420, 127.1085, '주거', 20, 2, true, false),
  ('40000000-0000-0000-0000-000000000002', '덕진구 복합상업시설', '전주시 덕진구 금암동 123',
   35.8400, 127.1100, '상업', 8, 1, true, false),
  ('40000000-0000-0000-0000-000000000003', '전주 제조공장 A', '전주시 덕진구 팔복동 1234',
   35.8650, 127.1580, '공장', 3, 0, false, true)
on conflict (id) do nothing;

-- ── 시뮬레이션 사고 시나리오 1: 아파트 화재 ─────────────────
insert into incidents (
  id, incident_number, incident_type, severity, title,
  address, lat, lon, building_id, commander_id,
  status, reported_at, dispatched_at, arrived_at,
  initial_report, caller_info
) values (
  '50000000-0000-0000-0000-000000000001',
  '2024-DK-0001',
  'fire', 4,
  '금암동 아파트 12층 화재',
  '전주시 덕진구 금암동 455 (금암아이파크 12층)',
  35.8420, 127.1085,
  '40000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'onscene',
  now() - interval '45 minutes',
  now() - interval '42 minutes',
  now() - interval '35 minutes',
  '아파트 12층에서 검은 연기 발생. 주민 대피 중. 내부 인원 1명 갇힘',
  '010-1234-5678 주민 신고'
) on conflict (id) do nothing;

-- 시나리오 1 출동 배정
insert into dispatches (incident_id, vehicle_id, dispatched_by, dispatched_at, arrived_at, role_at_scene) values
  ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000001', now()-interval '42m', now()-interval '35m', '지휘'),
  ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002',
   '30000000-0000-0000-0000-000000000001', now()-interval '42m', now()-interval '34m', '주수'),
  ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000004',
   '30000000-0000-0000-0000-000000000001', now()-interval '41m', now()-interval '33m', '고가진입'),
  ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000006',
   '30000000-0000-0000-0000-000000000001', now()-interval '41m', now()-interval '35m', '구급대기')
on conflict do nothing;

-- 시나리오 1 차량 상태 업데이트
update vehicles set status = 'onscene' where id in (
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000004',
  '20000000-0000-0000-0000-000000000006'
);

-- 시나리오 1 전술 로그
insert into tactical_logs (incident_id, actor_id, action_type, content, ai_assisted) values
  ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
   'dispatch_vehicle', '덕진지휘1 출동 명령', false),
  ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
   'dispatch_vehicle', '덕진펌프1 출동 명령 — 주수 임무', false),
  ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
   'update_status', '[dispatched → onscene] 선착대 현장 도착, 고층 화재 확인. 고가차 요청', false),
  ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
   'ai_copilot_query',
   '12층 화재, 스프링클러 작동 확인 요망. 유사 고층 화재 사례 기준 진입 팀 2개조 추가 필요.
    배연설비 강제 작동 요청 권고. 구조 대상자 1명 위치: 1201호 추정.',
   true)
on conflict do nothing;
-- ============================================================
-- FIRE-PALANTIR: FIRE.BRAIN 초기 지식 시드
-- 소방 전술 교리 + 과거 유사 사례 기반 (가상 데이터)
-- ============================================================

insert into knowledge_items (title, incident_type, building_type, content, tags, source) values

-- ── 고층 화재 전술 ─────────────────────────────────────────────
(
  '고층 아파트 화재 — 초기 진입 전술',
  'fire', '고층주거',
  '11층 이상 고층 아파트 화재 시 표준 전술:
1. 계단을 통한 수직 호스 전개 (1층당 약 3분 소요 예상)
2. 발화층 아래 2개 층에 관창팀 배치 (상향 연소 방지)
3. 옥상 배연 여부 확인 — 미작동 시 인위적 배연 조치
4. 스프링클러 작동 확인 후 주수량 조율
5. 피난 계단 분리 유지 — 진입 계단과 피난 계단 구분 필수
주의: 고층화재 연기 하강 현상으로 하층부 인명피해 가능. 전층 대피 유도.',
  ARRAY['고층','화재','진입전술','배연','스프링클러'],
  'seed'
),
(
  '고층 화재 — 자원 소요 기준',
  'fire', '고층주거',
  '고층화재 위험도별 최소 자원 기준 (전주덕진소방서 기준):
위험도 3: 펌프2 + 탱크1 + 고가/굴절1 + 구급1
위험도 4: 위 + 구조1 + 지휘1 (관할 외 지원 요청 검토)
위험도 5: 전체 가용 자원 + 인접 센터 전원 출동 + 시청·경찰 협력
11~20층: 고가차(52m) 도달 한계 — 내부 진입 주력
21층 이상: 헬기 지원 요청 검토 (전북소방본부 헬기 요청)',
  ARRAY['고층','자원소요','출동기준'],
  'seed'
),

-- ── 교통사고 구조 ─────────────────────────────────────────────
(
  '교통사고 구조 — 차량 내 요구조자 처리',
  'rescue', null,
  '차량 충돌 사고 요구조자 구조 표준 절차:
1. 현장 접근 전 2차 사고 방지 — 삼각대 설치 및 교통 통제 요청
2. 연료 누출 확인 — 가솔린/LPG/전기차 여부 식별 (전기차: 배터리 화재 위험)
3. 유압구조장비(스프레더·커터) 사용 전 요구조자 보호 조치
4. 의식 불명 시 경추 고정 유지하며 추출
5. 복합 충돌(2대 이상): 구조팀 분리 배치, 구급팀 우선순위 분류
전기차 화재 시 다량 주수 필요 — 배터리 냉각에 최소 30분 지속 주수',
  ARRAY['교통사고','구조','유압장비','전기차'],
  'seed'
),

-- ── 화학물질 누출 ─────────────────────────────────────────────
(
  '화학물질 누출 — 초기 대응 절차',
  'hazmat', '공장',
  '화학공장 가스 누출 초기 대응:
1. 접근 전 MSDS 또는 물질 종류 확인 필수
2. 방호복 착용 등급 결정: 염소·암모니아 = A등급(완전밀폐) 권장
3. 풍향 확인 — 바람을 등지는 방향에서 접근
4. 반경 300m(염소), 500m(암모니아) 경계구역 설정 및 주민 대피
5. 중화제 적용: 염소 → 탄산나트륨 수용액, 암모니아 → 희석산(약산)
6. 소방청 화학구조대 또는 지역 산업체 자체 화학팀 협력 요청
누출 차단 전 스파크 발생 금지 — 방폭 장비만 사용',
  ARRAY['화학','누출','방호복','대피','중화'],
  'seed'
),
(
  '화학물질 부상자 응급처치',
  'hazmat', null,
  '화학물질 흡입/접촉 부상자 현장 응급처치:
흡입 피해(염소·암모니아): 신선한 공기로 이동, 산소 투여, 의식 확인
피부 접촉: 즉시 다량의 물로 15분 이상 세척, 오염 의복 제거
눈 접촉: 생리식염수로 10~15분 세척, 안과 전문 치료 필요
주의: 오염된 대원이 병원 이송 시 의료진 2차 오염 방지 — 제염 후 이송',
  ARRAY['화학','부상자','응급처치','제염'],
  'seed'
),

-- ── 구급 대응 ─────────────────────────────────────────────────
(
  '화재 현장 연기 흡입 환자 처치',
  'fire', null,
  '화재 연기 흡입 환자 현장 응급처치:
1. 산소 15L/min 고유량 투여 — 일산화탄소 중독 의심 시 필수
2. 의식 수준 평가 (GCS) — 8 이하 시 기도 확보 검토
3. 사이안화수소 노출 의심(플라스틱 화재) → 해독제(하이드록소코발라민) 투여
4. 상기도 화상 의심(코털·눈썹 탄화) → 즉시 3차 병원 이송
일산화탄소 중독은 증상이 지연되어 나타날 수 있음 — 이송 필수',
  ARRAY['구급','연기흡입','일산화탄소','기도화상'],
  'seed'
),

-- ── 대형사고 지휘 ─────────────────────────────────────────────
(
  '대형사고 현장 지휘 체계',
  'fire', null,
  '위험도 4~5 대형사고 지휘 체계:
1. 지휘관 선착 시 지휘차 위치 확정 (풍향 상부, 안전 거리 확보)
2. 안전관 지정 — 진입팀 체력/산소 잔량 모니터링
3. 급속진행화재(플래시오버) 징후 감시: 천장부 농연 하강, 창문 유리 변색
4. 5분마다 상황 보고 — 무선채널 분리 (지휘/현장/구급)
5. 관할 외 자원 요청 기준: 가용 차량 70% 이상 투입 시 자동 요청
플래시오버 징후 시 즉시 전원 철수 — 방어전술 전환',
  ARRAY['지휘','대형사고','플래시오버','안전'],
  'seed'
),

-- ── 구조 전술 ─────────────────────────────────────────────────
(
  '수난사고 — 익수자 구조',
  'rescue', null,
  '수난사고 익수자 구조 절차:
1. 육상에서 구명환 투척 우선 — 직접 입수는 마지막 수단
2. 보트 이용 시 익수자 보트 후면에서 접근 (프로펠러 위험)
3. 저체온 의심 시 체온 측정 전 심폐소생술 시행 금지
4. 심폐소생술 중단 기준: 냉수 익수는 30°C 이상 복온 후 판단
익수 후 의식 있어도 병원 이송 필수 — 지연성 폐부종(이차 익수) 위험',
  ARRAY['수난','익수','구조','저체온'],
  'seed'
),

-- ── 실패 사례·교훈 ─────────────────────────────────────────────
(
  '고층화재 대응 교훈 — 배연 지연 사례',
  'fire', '고층주거',
  '[2023년 전주시 유사 사례 기반 교훈]
상황: 17층 아파트 화재, 스프링클러 미작동, 배연 설비 전원 차단 상태
결과: 연기 하강으로 하층 주민 다수 연기 흡입 피해
교훈:
1. 고층화재 도착 직후 관리자 확보하여 스프링클러/배연 시스템 수동 가동
2. 전기 차단이 소방 설비에 영향을 주는 경우가 많음 — 별도 전원 확인
3. 저층부 연기 피해가 발화층보다 클 수 있음 — 전층 대피 유도 즉시 실시
4. 다음 유사 건물 방문점검 시 배연 설비 수동 가동 여부 확인 항목 추가',
  ARRAY['고층','교훈','배연','스프링클러','실패사례'],
  'seed'
);
-- ============================================================
-- FIRE-PALANTIR: RLS 정책 — PoC 데모용 (anon 읽기/쓰기 허용)
-- ============================================================

  -- stations                                                                   alter table stations enable row level security;                               create policy "stations_read" on stations for select using (true);            create policy "stations_write" on stations for all using (true) with check
  alter table stations enable row level security;  
  create policy "stations_read" on stations for select using (true);
  create policy "stations_write" on stations for all using (true) with check
  (true);


  -- buildings
  alter table buildings enable row level security;
  create policy "buildings_read" on buildings for select using (true);
  create policy "buildings_write" on buildings for all using (true) with check
   (true);

  -- vehicles
  alter table vehicles enable row level security;
  create policy "vehicles_read" on vehicles for select using (true);
  create policy "vehicles_write" on vehicles for all using (true) with check
  (true);

  -- personnel
  alter table personnel enable row level security;
  create policy "personnel_read" on personnel for select using (true);
  create policy "personnel_write" on personnel for all using (true) with check
   (true);

  -- incidents
  alter table incidents enable row level security;
  create policy "incidents_read" on incidents for select using (true);
  create policy "incidents_write" on incidents for all using (true) with check
   (true);

  -- dispatches
  alter table dispatches enable row level security;
  create policy "dispatches_read" on dispatches for select using (true);
  create policy "dispatches_write" on dispatches for all using (true) with
  check (true);

  -- tactical_logs
  alter table tactical_logs enable row level security;
  create policy "tactical_logs_read" on tactical_logs for select using (true);
  create policy "tactical_logs_write" on tactical_logs for all using (true)
  with check (true);

  -- knowledge_items
  alter table knowledge_items enable row level security;
  create policy "knowledge_items_read" on knowledge_items for select using
  (true);
  create policy "knowledge_items_write" on knowledge_items for all using
  (true) with check (true);

  -- knowledge_extractions
  alter table knowledge_extractions enable row level security;
  create policy "knowledge_extractions_read" on knowledge_extractions for
  select using (true);
  create policy "knowledge_extractions_write" on knowledge_extractions for all
   using (true) with check (true);

  -- notifications
  alter table notifications enable row level security;
  create policy "notifications_read" on notifications for select using (true);
  create policy "notifications_write" on notifications for all using (true)
  with check (true);

  -- safepass_requests
  alter table safepass_requests enable row level security;
  create policy "safepass_read" on safepass_requests for select using (true);
  create policy "safepass_write" on safepass_requests for all using (true)
  with check (true);
