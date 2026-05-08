-- 0007_action_urls.sql
-- Multiple action URLs per screenshot — AI can return several, and the
-- user can add their own custom links. Each entry is {url, type, label?,
-- source: 'ai' | 'manual'}. Replaces the single action_url + action_url_type pair.
--
-- Backfills any existing single action_url into the new array as an AI entry
-- so existing rows keep working. The legacy columns stay for a release for
-- safety; remove them in a follow-up migration once nothing reads them.

alter table screenshots
  add column if not exists action_urls jsonb not null default '[]'::jsonb;

update screenshots
set action_urls = jsonb_build_array(
  jsonb_build_object(
    'url', action_url,
    'type', coalesce(action_url_type, 'search'),
    'source', 'ai'
  )
)
where action_url is not null
  and action_urls = '[]'::jsonb;
