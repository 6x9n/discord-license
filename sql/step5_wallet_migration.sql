-- Step 5: move account-derived ledger entries to the existing USDT bucket.
-- Run only after reviewing and approving this migration and verifying both
-- step-5 backup tables exist.
begin;

do $$
declare
  v_trading_id uuid := 'e0ec3153-c7df-4272-8533-649baf2d34a7';
  v_usdt_id uuid := '56c94c52-f532-446e-8652-d256dfdbf1fc';
  v_mirror_id uuid := 'eff28336-4d70-4bf1-85b1-0bc5c71656a6';
  v_mirror_key text := 'usdt:sale1:644432270463205387';
  v_candidate_count integer;
  v_mirror_count integer;
  v_moved_count integer;
  v_deleted_count integer;
begin
  if to_regclass('public.money_entries_backup_step5_20261115') is null then
    raise exception 'Required backup table public.money_entries_backup_step5_20261115 is missing.';
  end if;
  if to_regclass('public.money_buckets_backup_step5_20261115') is null then
    raise exception 'Required backup table public.money_buckets_backup_step5_20261115 is missing.';
  end if;

  if not exists (
    select 1
    from public.money_buckets_backup_step5_20261115
    where id = v_trading_id and name = 'Trading Capital' and currency = 'EGP'
  ) or not exists (
    select 1
    from public.money_buckets_backup_step5_20261115
    where id = v_usdt_id and name = 'USDT' and currency = 'USDT'
  ) then
    raise exception 'The bucket backup does not match the reviewed Trading Capital and USDT buckets.';
  end if;

  if not exists (
    select 1
    from public.money_entries_backup_step5_20261115
    where id = v_mirror_id
      and source_key = v_mirror_key
      and source = 'ACCOUNT_SALE'
      and bucket_id = v_usdt_id
  ) then
    raise exception 'The entry backup does not contain the exact reviewed duplicate mirror row.';
  end if;

  if not exists (
    select 1
    from public.money_buckets
    where id = v_trading_id
      and name = 'Trading Capital'
      and currency = 'EGP'
      and archived = false
  ) then
    raise exception 'The live Trading Capital bucket is missing, archived, or changed.';
  end if;
  if not exists (
    select 1
    from public.money_buckets
    where id = v_usdt_id
      and name = 'USDT'
      and currency = 'USDT'
      and archived = false
  ) then
    raise exception 'The live USDT bucket is missing, archived, or changed.';
  end if;

  if exists (
    select 1
    from public.money_entries
    where id = v_mirror_id
      and (
        source_key <> v_mirror_key
        or source <> 'ACCOUNT_SALE'
        or bucket_id <> v_usdt_id
      )
  ) then
    raise exception 'The reviewed mirror entry ID exists but no longer matches the dry-run row.';
  end if;
  if exists (
    select 1
    from public.money_entries
    where source_key = v_mirror_key and id <> v_mirror_id
  ) then
    raise exception 'The reviewed mirror source_key now belongs to a different entry ID.';
  end if;

  select count(*) into v_candidate_count
  from public.money_entries
  where bucket_id = v_trading_id
    and (
      (source = 'ACCOUNT_BUY' and direction = 'OUT')
      or (source = 'ACCOUNT_SALE' and direction = 'IN')
    );

  select count(*) into v_mirror_count
  from public.money_entries
  where id = v_mirror_id
    and source_key = v_mirror_key
    and source = 'ACCOUNT_SALE'
    and bucket_id = v_usdt_id;

  if v_candidate_count = 0 and v_mirror_count = 0 then
    raise notice 'No rows changed; the reviewed wallet migration may already be applied.';
  else
    if v_candidate_count <> 5 or v_mirror_count <> 1 then
      raise exception
        'Expected 5 account entries to move and 1 exact mirror row to delete; found % and %.',
        v_candidate_count, v_mirror_count;
    end if;

    update public.money_entries as e
    set bucket_id = v_usdt_id
    where e.bucket_id = v_trading_id
      and (
        (e.source = 'ACCOUNT_BUY' and e.direction = 'OUT')
        or (e.source = 'ACCOUNT_SALE' and e.direction = 'IN')
      );
    get diagnostics v_moved_count = row_count;

    delete from public.money_entries
    where id = v_mirror_id
      and source_key = v_mirror_key
      and source = 'ACCOUNT_SALE'
      and bucket_id = v_usdt_id;
    get diagnostics v_deleted_count = row_count;

    if v_moved_count <> 5 or v_deleted_count <> 1 then
      raise exception
        'Post-change guard failed: expected 5 moved and 1 deleted, got % and %; transaction rolled back.',
        v_moved_count, v_deleted_count;
    end if;

    raise notice 'Moved % account-derived entries and deleted % approved mirror row(s).',
      v_moved_count, v_deleted_count;
  end if;
end;
$$;

commit;
notify pgrst, 'reload schema';
