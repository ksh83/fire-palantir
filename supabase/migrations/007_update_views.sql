-- v_active_incidents 뷰에 무전 에이전트 필드 추가
DROP VIEW IF EXISTS v_active_incidents;
CREATE VIEW v_active_incidents AS
SELECT
  i.id, i.incident_number, i.incident_type, i.severity, i.title, i.address,
  i.lat, i.lon, i.status, i.reported_at, i.dispatched_at, i.arrived_at,
  i.fire_stage, i.par_count, i.hazmat_risk,
  p.name  AS commander_name,
  p.rank  AS commander_rank,
  COUNT(d.id) AS vehicle_count,
  EXTRACT(epoch FROM (now() - i.reported_at)) / 60 AS elapsed_minutes
FROM incidents i
LEFT JOIN personnel p ON p.id = i.commander_id
LEFT JOIN dispatches d ON d.incident_id = i.id AND d.released_at IS NULL
WHERE i.status != 'closed'
GROUP BY i.id, p.name, p.rank;
