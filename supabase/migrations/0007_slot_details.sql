-- TimeCrumbs · Daily Log "업무내용" column: free-text details per 30-min slot.
-- Replaces the 몰입도 (focus 0–3) column in the grid; existing focus values are kept as they are.
alter table public.time_slots
  add column details text not null default '' check (length(details) <= 2000);
