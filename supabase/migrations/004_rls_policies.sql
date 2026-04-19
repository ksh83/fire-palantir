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
