# FIRE-PALANTIR — Claude Code Harness

## 프로젝트 정체성

**국내 최초 소방 운영 온톨로지 + AI 지휘지원 통합 플랫폼 PoC**
설계자: Ksh (전주덕진소방서 현직 소방관)

이 프로젝트는 팔란티어(Palantir) 아키텍처 원리를 공개 기술로 구현한다.
목표: 소방청·행안부가 전국 확장 예산을 투입할 근거를 작동하는 시스템으로 증명.

---

## 아키텍처 4개 레이어

```
Layer 4. 운영 자동화     — SafePass 연동, KakaoTalk 알림, 사후 지식 추출
Layer 3. AI 코파일럿     — 자연어 쿼리, 상황 브리핑, 전술 판단 지원 (RAG)
Layer 2. 실시간 대시보드 — FIRE-TWIN, CPC(다중 소방서), 차량/인원/사고 통합뷰
Layer 1. 소방 온톨로지   — 통합 데이터 모델, Action Types, 감사로그 (핵심)
─────────────────────────────────────────────────────────────────────────
인프라: Supabase(PostgreSQL+Realtime+pgvector) · Vercel · Claude API · Vite PWA
```

---

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| DB / 온톨로지 | Supabase PostgreSQL + Row Level Security |
| 실시간 | Supabase Realtime (WebSocket) |
| 벡터 검색 (RAG) | pgvector (Supabase 내장) |
| 프론트엔드 | React + Vite PWA |
| AI 엔진 | Claude API — `claude-sonnet-4-6` |
| 자동화 | Supabase Edge Functions |
| 지도 | Kakao Map API |
| 배포 | Vercel |

---

## Layer 1: 소방 온톨로지 스키마 (절대 임의 변경 금지)

### Object Types

```
Incident       id, type(화재/구조/구급), severity(1~5), address, coordinates,
               reportedAt, dispatchedAt, closedAt, building_id→Building, commander_id→Personnel

Vehicle        id, callSign(펌프1/굴절2 등), type, status(대기/출동중/현장/귀소),
               currentLocation(GPS), crewCount, equipmentList, station_id→Station

Personnel      id, name, rank, role, certifications(구조사/구급사/화학),
               currentStatus(근무/출동/휴무), vehicle_id→Vehicle

Building       id, address, type(주거/상업/공장), floors, basement_floors,
               hazmat_info, sprinkler, hydrant_location, last_inspection_date

Station        id, name, district, coordinates, vehicles[], personnel[]

TacticalLog    incident_id, timestamp, actor_id, action_type,
               content, ai_assisted(bool), outcome
```

### Action Types 규칙 (팔란티어 핵심 원칙)

> **모든 쓰기 작업은 반드시 Action Type을 통과해야 한다. 직접 DB 쓰기 금지.**

```
dispatchVehicle(vehicleId, incidentId, commanderId)
  검증 → 차량 대기 상태 확인, 지휘관 권한 확인
  실행 → 차량 status 변경, 출동 타임라인 기록
  로그 → who/when/why TacticalLog 자동 기록

updateTacticalStatus(incidentId, status, note)
  검증 → 현장 지휘관 권한만 허용
  실행 → 상황 업데이트 + 관련 인원 알림

closeIncident(incidentId, outcome)
  검증 → 모든 차량 귀소 여부 확인
  실행 → 사고 종료
  자동 → FIRE.BRAIN 사후 지식 추출 파이프라인 트리거
```

---

## Layer 3: AI 코파일럿 구현 패턴

### Claude API 호출 규칙

- 모델: `claude-sonnet-4-6`
- **반드시 prompt caching 적용** — system prompt와 온톨로지 컨텍스트에 `cache_control` 사용
- 응답 형식: 항상 구조화 JSON (판단 + 근거 + 확신도)
- 모든 AI 호출 결과는 `TacticalLog`에 `ai_assisted=True`로 기록

### FIRE_COMMANDER_SYSTEM_PROMPT (변경 시 신중히)

```
당신은 소방 현장 지휘관을 지원하는 AI 코파일럿입니다.

역할:
- 현재 온톨로지 상태와 유사 사례를 기반으로 전술 브리핑을 제공합니다
- 판단은 지휘관이 합니다. AI는 브리핑하고 선택지를 제시합니다
- 모든 응답에 근거 데이터와 확신도를 명시합니다

응답 형식 (JSON):
{
  "situation_summary": "현황 요약 (2~3문장)",
  "tactical_options": [
    {
      "option": "전술 선택지",
      "rationale": "근거 (유사 사례 포함)",
      "risks": "위험 요소",
      "confidence": 0.0~1.0
    }
  ],
  "immediate_action": "즉시 조치 권고사항",
  "data_basis": "판단 근거 데이터 출처"
}

제약:
- 불확실한 정보를 확실한 것처럼 말하지 않습니다
- 인명 피해 가능성이 있는 판단은 반드시 확신도 0.8 이하로 표시합니다
- 지휘관의 최종 결정권을 항상 강조합니다
```

### 코파일럿 함수 패턴

```python
def fire_copilot(incident_id: str, query: str):
    context = build_ontology_context(incident_id)   # Layer 1 상태 조회
    similar_cases = rag_search(query, top_k=3)       # pgvector RAG
    
    response = claude.messages.create(
        model="claude-sonnet-4-6",
        system=[
            {"type": "text", "text": FIRE_COMMANDER_SYSTEM_PROMPT,
             "cache_control": {"type": "ephemeral"}}   # 프롬프트 캐싱
        ],
        messages=[{
            "role": "user",
            "content": f"현재상황:\n{context}\n\n유사사례:\n{similar_cases}\n\n질문: {query}"
        }]
    )
    
    log_action(incident_id, "ai_copilot_query", response, ai_assisted=True)
    return response
```

---

## 개발 원칙

### 필수 원칙
1. **온톨로지 무결성**: 모든 상태 변경은 Action Type Edge Function 경유
2. **감사 추적**: 모든 Action → TacticalLog 자동 기록 (ai_assisted 포함)
3. **설명 가능성**: AI 판단에 항상 근거·확신도 포함
4. **현장 우선**: PWA 모바일 최적화, 저사양·저대역폭 환경 고려
5. **보안**: Supabase RLS로 역할별 접근 제어 (지휘관/대원/상황실 분리)

### 코딩 규칙
- TypeScript 사용 (프론트엔드), Python (AI 파이프라인)
- 컴포넌트 단위: Object Explorer 패턴 유지 (팔란티어 UI 철학)
- 시드 데이터: 전주덕진소방서 실제 차량·인원 수 기준
- 에러 처리: 현장에서 앱이 멈추면 안 됨 — graceful degradation 필수

### 하지 말 것
- `TacticalLog` 없이 상태 직접 변경
- 온톨로지 스키마 임의 변경 (반드시 논의 후)
- `ai_assisted` 플래그 누락
- 모바일에서 작동 안 되는 UI

---

## 현재 Phase

**Phase 1~3 완료** — Supabase + API 키 입력 시 즉시 라이브 데모 가능

### Phase 1 — 온톨로지 기반 ✅
- [x] 소방 온톨로지 스키마 (migrations/001_ontology_core.sql)
- [x] Action Types PostgreSQL 함수 (dispatchVehicle / updateStatus / closeIncident)
- [x] 전주덕진 시드 데이터 (seeds/001_deokjin_seed.sql)
- [x] Vite PWA 설정 (오프라인 앱 셸)
- [x] 시뮬레이션 시나리오 3개 (고층화재 / 교통구조 / 화학누출)

### Phase 2 — AI 코파일럿 ✅
- [x] FIRE.BRAIN pgvector 마이그레이션 (migrations/002_firebrain_rag.sql)
- [x] 소방 전술 교리 시드 9개 (seeds/002_knowledge_seed.sql)
- [x] fire-copilot Edge Function (RAG + prompt caching + 구조화 JSON 응답)
- [x] knowledge-extractor Edge Function (사고 종료 후 자동 교훈 추출)
- [x] FIRE.BRAIN 탐색 페이지 (pages/FireBrain.jsx)
- [x] AiCopilot 컴포넌트 (StructuredResponse 렌더링)

### Phase 3 — 운영 자동화 ✅
- [x] notify-dispatch Edge Function (SafePass + KakaoTalk 역할별 3종)
- [x] 알림 로그 테이블 (migrations/003_notifications.sql)
- [x] NotificationCenter 컴포넌트 (Realtime 실시간 알림 벨)
- [x] 신규 사고 접수 모달 (components/NewIncidentModal.jsx)
- [x] 정책 발표용 소개 화면 (pages/Intro.jsx)

### 배포 체크리스트
```bash
supabase db push
psql $DB_URL -f supabase/seeds/002_knowledge_seed.sql
supabase functions deploy fire-copilot
supabase functions deploy knowledge-extractor
supabase functions deploy notify-dispatch
supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxxxx
supabase secrets set KAKAO_REST_API_KEY=xxxxx
supabase secrets set APP_URL=https://fire-palantir.vercel.app
```

---

## 시드 데이터 기준

전주덕진소방서 기준:
- 소방서 1개 + 센터 다수
- 펌프차, 굴절차, 구조차, 구급차 등 차량 유형
- 소방사~소방정 계급 체계
- 실제 과거 출동 시나리오 3개 이상 재현 가능하게 구성

---

*FIRE-PALANTIR PoC | 설계: Ksh (전주덕진소방서) × Claude*
