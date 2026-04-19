-- ============================================================
-- FIRE-PALANTIR: 무전 에이전트 — incidents 테이블 확장
-- ============================================================

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS fire_stage   TEXT    DEFAULT '미확인';
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS par_count    INT     DEFAULT 0;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS hazmat_risk  BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN incidents.fire_stage  IS '화재 단계: 미확인/초기/중기/성기/대형';
COMMENT ON COLUMN incidents.par_count   IS '현재 건물 내 진입 대원 수 (PAR)';
COMMENT ON COLUMN incidents.hazmat_risk IS '위험물 존재 여부';
