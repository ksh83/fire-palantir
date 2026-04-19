import './Intro.css'

const INCIDENTS = [
  { year: '2018', location: '밀양 세종병원', dead: 47, injured: 143,
    problem: '지하 주차장 화재 → 계단 연기 충전 → 환자 대피 불가. 병원 구조 정보 없이 대원 진입.' },
  { year: '2018', location: '제천 스포츠센터', dead: 29, injured: 40,
    problem: '필로티 주차장 화재 → 내부 구조 파악 실패 → 구조 골든타임 초과. 드라이비트 외벽 확산 예측 불가.' },
  { year: '2020', location: '이천 물류센터', dead: 38, injured: 10,
    problem: '우레탄 폼 내장재 폭발 연소. 내부 위험물 정보 없이 대원 진입. 생존자 위치 실시간 파악 불가.' },
  { year: '2024', location: '화성 아리셀', dead: 23, injured: 8,
    problem: '리튬배터리 연쇄폭발. 위험물 종류·위치 정보 부재. 외국인 근로자 현황 파악 불가. 대피 경로 혼선.' },
]

const GAP_ITEMS = [
  { icon: '🏢', title: '건물 정보 단절', desc: '소방활동정보조사서 전산 존재하나 현장 대원은 실시간 확인 불가. 현장대응단 단톡방 공유가 전부.' },
  { icon: '📡', title: '무전 정보 소실', desc: '현장 모든 상황이 무전으로 공유되지만 어떤 시스템에도 기록·분석되지 않음.' },
  { icon: '🚒', title: '차량·인원 추적 불가', desc: '어느 대원이 어느 구역에 있는지 파악 불가. PAR 확인은 음성 무전에만 의존.' },
  { icon: '🎥', title: '카메라 피드 고립', desc: '차량 CCTV는 119상황실에서 독립 시청. 지휘관 태블릿과 연결 없음.' },
  { icon: '🤖', title: 'AI 판단 지원 없음', desc: '지휘관은 연기·화세 크기를 육안으로만 판단. 유사 사례 참조 시스템 없음.' },
  { icon: '⏱️', title: '통합 상황판 없음', desc: '건물·차량·인원·무전·카메라가 각각 동작. 지휘관 개인 능력이 전부.' },
]

const LAYERS = [
  { num: '4', title: '운영 자동화',         desc: 'SafePass 신호 제어 · KakaoTalk 알림 · 지식 자동 추출', icon: '⚡', color: 'warn' },
  { num: '3', title: 'AI 지휘지원 코파일럿', desc: '무전 자동 분석 · 상황 브리핑 · RAG 전술 판단 지원',   icon: '🤖', color: 'info' },
  { num: '2', title: '실시간 현장지휘 뷰',   desc: '건물 온톨로지 · 무전 에이전트 · 차량 카메라 통합',    icon: '📡', color: 'success' },
  { num: '1', title: '소방 온톨로지 (핵심)', desc: '통합 데이터 모델 · Action Types · 감사로그',         icon: '🏗️', color: 'accent' },
]

const PROOFS = [
  { icon: '✅', title: '기술 가능성',  desc: '팔란티어 수준 AI 플랫폼을 공개 기술(Supabase + Vercel + Claude)로 구현' },
  { icon: '📐', title: '설계 논거',    desc: '소방 데이터가 온톨로지로 연결될 때 골든타임을 줄일 수 있음을 작동하는 시스템으로 증명' },
  { icon: '🏛️', title: '선례 창출',    desc: '소방청 전국 확장 · 경찰청 · 해경 유사 시스템의 기술적 근거 제공' },
  { icon: '👤', title: '인재 증명',    desc: '현직 소방관 × Claude Code = 어떤 SI도 단기간에 못 만드는 결과물' },
]

const STACK = [
  { layer: '온톨로지 DB',  tech: 'Supabase PostgreSQL + RLS' },
  { layer: '실시간',       tech: 'Supabase Realtime (WebSocket)' },
  { layer: 'RAG 검색',    tech: 'pgvector (Supabase 내장)' },
  { layer: '프론트엔드',   tech: 'React + Vite PWA' },
  { layer: 'AI 엔진',     tech: 'Claude API (claude-sonnet-4-6)' },
  { layer: '자동화',       tech: 'Supabase Edge Functions' },
  { layer: '배포',         tech: 'Vercel (전국 CDN)' },
]

export default function Intro({ onEnter }) {
  return (
    <div className="intro">
      {/* ── 히어로 */}
      <section className="hero">
        <div className="hero-eyebrow">공공 선도 구현 청사진 v2.0 · PoC</div>
        <h1 className="hero-title">
          <span className="fire-text">FIRE</span>
          <span className="dash">-</span>
          <span className="palantir-text">PALANTIR</span>
        </h1>
        <p className="hero-sub">
          현직 소방관이 팔란티어 아키텍처 원리를 공개 기술로 구현한<br />
          <strong>국내 최초 소방 운영 온톨로지 + AI 지휘지원 통합 플랫폼</strong>
        </p>
        <div className="hero-meta">설계: Ksh (전주덕진소방서) × Claude Code</div>
        <button className="btn btn-hero" onClick={onEnter}>라이브 데모 시작 →</button>
      </section>

      {/* ── 문제 정의: 대형 인명피해 사고 */}
      <section className="section">
        <div className="section-eyebrow">WHY NOW</div>
        <h2 className="section-title">10년간 반복된 비극 — 공통 원인은 <span style={{color:'var(--accent)'}}>정보 단절</span></h2>
        <p className="section-desc">
          현장 지휘관은 연기와 화염 속에서 육안과 직관으로만 판단합니다.<br />
          건물 구조·위험물·인원 위치·차량 현황 — 모든 정보가 이미 존재하지만 통합되지 않았습니다.
        </p>
        <div className="incidents-grid">
          {INCIDENTS.map(i => (
            <div key={i.location} className="incident-card card">
              <div className="incident-header">
                <span className="incident-year">{i.year}</span>
                <span className="incident-location">{i.location}</span>
                <span className="incident-casualties">
                  사망 <strong style={{color:'var(--danger)'}}>{i.dead}</strong>명
                </span>
              </div>
              <p className="incident-problem">{i.problem}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── 현재의 문제 */}
      <section className="section section-dark">
        <div className="section-eyebrow">THE PROBLEM</div>
        <h2 className="section-title">현재 소방 현장의 <span style={{color:'var(--warn)'}}>6가지 정보 단절</span></h2>
        <div className="gap-grid">
          {GAP_ITEMS.map(g => (
            <div key={g.title} className="gap-card card">
              <div className="gap-icon">{g.icon}</div>
              <div className="gap-title">{g.title}</div>
              <div className="gap-desc">{g.desc}</div>
            </div>
          ))}
        </div>
        <div className="gap-quote">
          "소방청이 도입하지 못한 이유는 기술이 없어서가 아닙니다. 통합 설계가 없었기 때문입니다."
        </div>
      </section>

      {/* ── 솔루션: 4개 레이어 */}
      <section className="section">
        <div className="section-eyebrow">THE SOLUTION</div>
        <h2 className="section-title">FIRE-PALANTIR — 4개 레이어 통합 아키텍처</h2>
        <div className="layers">
          {LAYERS.map(l => (
            <div key={l.num} className={`layer-card layer-${l.color}`}>
              <div className="layer-num">Layer {l.num}</div>
              <div className="layer-icon">{l.icon}</div>
              <div className="layer-title">{l.title}</div>
              <div className="layer-desc">{l.desc}</div>
            </div>
          ))}
        </div>
        <div className="infra-bar">
          인프라: Supabase · Vercel · Claude API · Vite PWA &nbsp;|&nbsp; PoC 운영비: 월 0~5만원
        </div>
      </section>

      {/* ── 핵심 기능 3가지 */}
      <section className="section section-dark">
        <div class="section-eyebrow">KEY FEATURES</div>
        <h2 className="section-title">현장을 바꾸는 <span style={{color:'var(--info)'}}>3가지 핵심 기능</span></h2>
        <div className="features-grid">
          <div className="feature-card card">
            <div className="feature-icon">📡</div>
            <div className="feature-title">무전 AI 에이전트</div>
            <div className="feature-desc">
              현장 무전을 실시간 분석해 화재 단계·PAR·위험물·자원 필요를 자동 추출.
              대원의 추가 행동 없이 시스템이 자동 업데이트됩니다.
            </div>
            <div className="feature-tag">Claude API · 실시간 분석</div>
          </div>
          <div className="feature-card card">
            <div className="feature-icon">🏢</div>
            <div className="feature-title">건물 온톨로지 브리핑</div>
            <div className="feature-desc">
              출동 즉시 건물 구조·위험물·스프링클러·소화전 위치가 지휘관 화면에 표시.
              3초 안에 현장 전술 권고까지 자동 생성됩니다.
            </div>
            <div className="feature-tag">팔란티어 온톨로지 패턴</div>
          </div>
          <div className="feature-card card">
            <div className="feature-icon">⚡</div>
            <div className="feature-title">현장지휘 통합 뷰</div>
            <div className="feature-desc">
              건물 정보 · 무전 현황 · 차량 카메라 · AI 전술 권고를 한 화면에서.
              지휘관 개인 역량에서 시스템 역량으로.
            </div>
            <div className="feature-tag">3-패널 풀스크린 지휘 모드</div>
          </div>
        </div>
      </section>

      {/* ── 이 결과물이 증명하는 것 */}
      <section className="section">
        <div className="section-eyebrow">PROOF OF CONCEPT</div>
        <h2 className="section-title">이 결과물이 증명하는 것</h2>
        <div className="proofs-grid">
          {PROOFS.map(p => (
            <div key={p.title} className="proof-card card">
              <div className="proof-icon">{p.icon}</div>
              <div className="proof-title">{p.title}</div>
              <div className="proof-desc">{p.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 기술 스택 */}
      <section className="section section-dark">
        <div className="section-eyebrow">TECH STACK</div>
        <h2 className="section-title">기술 스택 — 전액 공개 기술</h2>
        <div className="stack-table card">
          {STACK.map(s => (
            <div key={s.layer} className="stack-row">
              <span className="stack-layer">{s.layer}</span>
              <span className="stack-tech">{s.tech}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA */}
      <section className="cta-section">
        <h2 className="cta-title">지금 바로 체험하세요</h2>
        <p className="cta-desc">
          "전주덕진물류센터 화재" 시나리오가 준비되어 있습니다.<br />
          현장지휘 모드 → 무전 에이전트 → AI 전술 권고까지 5분이면 확인 가능합니다.
        </p>
        <button className="btn btn-hero" onClick={onEnter}>운영 대시보드로 이동 →</button>
      </section>
    </div>
  )
}
