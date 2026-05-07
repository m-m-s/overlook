-- Track the original device-media-library asset id so we can offer
-- "delete from device" after a library deletion (per CLAUDE.md).

alter table public.screenshots
  add column if not exists device_asset_id text;

create index if not exists screenshots_device_asset_idx
  on public.screenshots (device_asset_id);
