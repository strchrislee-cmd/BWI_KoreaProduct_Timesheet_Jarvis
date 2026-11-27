-- TeamEmbedded · AI 정리 (Claude) and correction proposals.
--
-- The Anthropic API key is set by admins in the Admin screen and kept in a schema the API does not
-- expose; only the server (service role, /api/ai/cleanup) reads it back. Each person's use is counted
-- per day (org_settings.ai_daily_limit) and logged with tokens and cost (ai_usage).
-- Correction proposals: an admin, or someone above a lower level in the Org Chart, proposes changes to
-- a person's 30-min log for one day; that person sees the diff and applies the rows they accept.

-- ── The API key: set by admins, read only by the server ─────────────────────
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.ai_settings (
  id smallint primary key default 1 check (id = 1),
  api_key text not null check (length(btrim(api_key)) >= 20),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
revoke all on private.ai_settings from public, anon, authenticated;

create or replace function public.set_ai_key(p_key text)
returns void language plpgsql security definer set search_path = public, private as $$
begin
  if not public.is_admin() then
    raise exception 'only admins can set the AI key' using errcode = '42501';
  end if;
  if p_key is null or btrim(p_key) = '' then
    delete from private.ai_settings;
  else
    insert into private.ai_settings (id, api_key, updated_by, updated_at) values (1, btrim(p_key), auth.uid(), now())
    on conflict (id) do update set api_key = excluded.api_key, updated_by = excluded.updated_by, updated_at = now();
  end if;
end $$;

-- admins see that a key is set (its last 4 characters), never the key itself
create or replace function public.ai_key_hint()
returns text language sql stable security definer set search_path = public, private as $$
  select case when public.is_admin() then (select '…' || right(api_key, 4) from private.ai_settings where id = 1) end
$$;

create or replace function public.get_ai_key()
returns text language plpgsql stable security definer set search_path = public, private as $$
begin
  if coalesce(public.request_role(), '') <> 'service_role' then
    raise exception 'only the server reads the AI key' using errcode = '42501';
  end if;
  return (select api_key from private.ai_settings where id = 1);
end $$;

-- ── Daily limit and the model (the cheapest: Claude Haiku 5.5) ──────────────
alter table public.org_settings add column if not exists ai_daily_limit integer not null default 10 check (ai_daily_limit between 0 and 200);
alter table public.org_settings alter column ai_model set default 'claude-haiku-5-5';
update public.org_settings set ai_model = 'claude-haiku-5-5' where ai_model is distinct from 'claude-haiku-5-5';

-- ── Who used AI, when, and what it cost ─────────────────────────────────────
create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- whose log it tidied: yourself, or the person a proposal is for
  owner_id uuid references public.profiles (id) on delete set null,
  work_date date not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric(10, 6) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_user_idx on public.ai_usage (user_id, created_at);

alter table public.ai_usage enable row level security;
drop policy if exists ai_usage_select on public.ai_usage;
create policy ai_usage_select on public.ai_usage for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
-- rows are written by the server only (service role)
revoke all on public.ai_usage from anon;
grant select on public.ai_usage to authenticated;
grant select, insert, update, delete on public.ai_usage to service_role;

-- one use, if today's (Korea time) count is under the limit; null when the limit is reached.
-- Locked per person so quick repeated clicks cannot pass the limit together.
create or replace function public.ai_begin(p_user uuid, p_owner uuid, p_work_date date, p_model text, p_limit integer)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
begin
  if coalesce(public.request_role(), '') <> 'service_role' then
    raise exception 'only the server records AI use' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 7014));
  if (select count(*) from public.ai_usage
       where user_id = p_user
         and created_at >= (date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')) >= p_limit then
    return null;
  end if;
  insert into public.ai_usage (user_id, owner_id, work_date, model) values (p_user, p_owner, p_work_date, p_model)
  returning id into v_id;
  return v_id;
end $$;

-- ── Correction proposals ────────────────────────────────────────────────────
-- admins propose to anyone; otherwise to someone of a lower level below you in the Org Chart
create or replace function public.can_propose(p_author uuid, p_owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  with recursive
    below (id) as (
      select p.id from public.profiles p where p.manager_id = p_author
      union
      select p.id from public.profiles p join below b on p.manager_id = b.id
    ),
    rank_of (role, n) as (values ('l1'::public.app_role, 1), ('l2', 2), ('l3', 3), ('admin', 4))
  select p_author is distinct from p_owner and (
    exists (select 1 from public.profiles a where a.id = p_author and a.role = 'admin')
    or exists (
      select 1 from below b
        join public.profiles o on o.id = b.id
        join rank_of ro on ro.role = o.role
        cross join public.profiles a
        join rank_of ra on ra.role = a.role
       where o.id = p_owner and a.id = p_author and ra.n > ro.n
    )
  )
$$;

create table if not exists public.correction_proposals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  work_date date not null,
  -- [{ slots: [slot indexes], before: {…}, after: {…}, reason }]: Project / Type / Task of a run of half hours
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 48),
  note text not null default '' check (length(note) <= 1000),
  by_ai boolean not null default false,
  status text not null default 'open' check (status in ('open', 'answered')),
  -- indexes of the items the person applied
  applied integer[],
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  check (owner_id <> author_id)
);
create index if not exists correction_proposals_owner_idx on public.correction_proposals (owner_id, status);
create index if not exists correction_proposals_author_idx on public.correction_proposals (author_id, created_at);

alter table public.correction_proposals enable row level security;
drop policy if exists proposals_select on public.correction_proposals;
create policy proposals_select on public.correction_proposals for select to authenticated
  using (owner_id = auth.uid() or author_id = auth.uid() or public.is_admin());
drop policy if exists proposals_insert on public.correction_proposals;
create policy proposals_insert on public.correction_proposals for insert to authenticated
  with check (author_id = auth.uid() and status = 'open' and applied is null and answered_at is null
              and public.can_propose(auth.uid(), owner_id));
-- the author can take back a proposal that is not answered yet
drop policy if exists proposals_delete on public.correction_proposals;
create policy proposals_delete on public.correction_proposals for delete to authenticated
  using (author_id = auth.uid() and status = 'open');

revoke all on public.correction_proposals from anon;
grant select, insert, delete on public.correction_proposals to authenticated;
grant select, insert, update, delete on public.correction_proposals to service_role;

-- the person it was sent to answers once: which items they applied (their log is changed by the app)
create or replace function public.answer_proposal(p_id uuid, p_applied integer[])
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.correction_proposals%rowtype;
begin
  select * into v from public.correction_proposals where id = p_id for update;
  if not found or v.owner_id is distinct from auth.uid() then
    raise exception 'only the person it was sent to can answer' using errcode = '42501';
  end if;
  if v.status <> 'open' then
    raise exception 'this proposal has already been answered' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(coalesce(p_applied, '{}')) i where i < 0 or i >= jsonb_array_length(v.items)) then
    raise exception 'unknown item' using errcode = '22023';
  end if;
  update public.correction_proposals
     set status = 'answered', applied = coalesce(p_applied, '{}'), answered_at = now()
   where id = p_id;
end $$;

-- ── Function privileges (0010: new functions are executable by signed-in users unless revoked) ──
revoke execute on function public.set_ai_key(text), public.ai_key_hint(), public.can_propose(uuid, uuid),
  public.answer_proposal(uuid, integer[]) from public, anon;
grant execute on function public.set_ai_key(text), public.ai_key_hint(), public.can_propose(uuid, uuid),
  public.answer_proposal(uuid, integer[]) to authenticated, service_role;
revoke execute on function public.get_ai_key(), public.ai_begin(uuid, uuid, date, text, integer) from public, anon, authenticated;
grant execute on function public.get_ai_key(), public.ai_begin(uuid, uuid, date, text, integer) to service_role;
