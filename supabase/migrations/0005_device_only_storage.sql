-- Switch to device-only storage per CLAUDE.md architecture:
-- "Images: On device only. Never stored on server."
--
-- storage_path becomes nullable. New uploads will populate device_asset_id
-- only and leave storage_path null. Existing rows with storage_path stay
-- valid (signed URL fallback) until the user re-imports.

alter table public.screenshots
  alter column storage_path drop not null;
