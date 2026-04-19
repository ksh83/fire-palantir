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
