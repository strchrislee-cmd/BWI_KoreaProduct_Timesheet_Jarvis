create function pg_temp.check(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAILED: %', label; end if;
  raise notice 'ok: %', label;
end $$;

create function pg_temp.expect_error(stmt text, label text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'EXPECTED ERROR: % (statement succeeded)', label;
exception when others then
  if sqlerrm like 'EXPECTED ERROR%' then raise; end if;
  raise notice 'ok (rejected): % → %', label, sqlerrm;
end $$;

create function pg_temp.affected(stmt text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute stmt;
  get diagnostics n = row_count;
  return n;
end $$;

-- switch identity like Supabase does for a signed-in user
create function pg_temp.login(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid, false);
$$;
