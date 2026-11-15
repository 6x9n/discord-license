-- Step 5 rollback: restore the moved account rows and the exact mirror row from
-- the verified snapshots. The forward migration does not change money_buckets,
-- so that table is checked against its backup but deliberately not overwritten.
begin;

do $$
declare
  v_trading_id uuid := 'e0ec3153-c7df-4272-8533-649baf2d34a7';
  v_usdt_id uuid := '56c94c52-f532-446e-8652-d256dfdbf1fc';
  v_mirror_id uuid := 'eff28336-4d70-4bf1-85b1-0bc5c71656a6';
  v_mirror_key text := 'usdt:sale1:644432270463205387';
  v_backup_entry_count integer;
  v_current_usdt_count integer;
  v_current_trading_count integer;
  v_mirror_count integer;
  v_restored_count integer;
  v_mirror_restored_count integer;
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
    from public.money_buckets
    where id = v_trading_id and name = 'Trading Capital' and currency = 'EGP'
  ) or not exists (
    select 1
    from public.money_buckets
    where id = v_usdt_id and name = 'USDT' and currency = 'USDT'
  ) then
    raise exception 'A bucket needed for rollback is missing or changed.';
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

  select count(*) into v_backup_entry_count
  from public.money_entries_backup_step5_20261115
  where bucket_id = v_trading_id
    and (
      (source = 'ACCOUNT_BUY' and direction = 'OUT')
      or (source = 'ACCOUNT_SALE' and direction = 'IN')
    );
  if v_backup_entry_count <> 5 then
    raise exception 'Expected exactly 5 moved account entries in the backup; found %.', v_backup_entry_count;
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
    raise exception 'The mirror entry ID now belongs to a different source_key.';
  end if;
  if exists (
    select 1
    from public.money_entries
    where source_key = v_mirror_key and id <> v_mirror_id
  ) then
    raise exception 'The mirror source_key now belongs to a different entry ID.';
  end if;

  select count(*) into v_current_usdt_count
  from public.money_entries as current_entry
  join public.money_entries_backup_step5_20261115 as backup_entry
    on backup_entry.id = current_entry.id
   and backup_entry.source_key = current_entry.source_key
  where current_entry.bucket_id = v_usdt_id
    and backup_entry.bucket_id = v_trading_id
    and (
      (backup_entry.source = 'ACCOUNT_BUY' and backup_entry.direction = 'OUT')
      or (backup_entry.source = 'ACCOUNT_SALE' and backup_entry.direction = 'IN')
    );

  select count(*) into v_current_trading_count
  from public.money_entries as current_entry
  join public.money_entries_backup_step5_20261115 as backup_entry
    on backup_entry.id = current_entry.id
   and backup_entry.source_key = current_entry.source_key
  where current_entry.bucket_id = v_trading_id
    and backup_entry.bucket_id = v_trading_id
    and (
      (backup_entry.source = 'ACCOUNT_BUY' and backup_entry.direction = 'OUT')
      or (backup_entry.source = 'ACCOUNT_SALE' and backup_entry.direction = 'IN')
    );

  select count(*) into v_mirror_count
  from public.money_entries
  where id = v_mirror_id
    and source_key = v_mirror_key
    and source = 'ACCOUNT_SALE'
    and bucket_id = v_usdt_id;

  if v_current_usdt_count = 0 and v_current_trading_count = 5 and v_mirror_count = 1 then
    raise notice 'No rows changed; the Step 5 rollback may already be applied.';
  elsif v_current_usdt_count = 5 and v_current_trading_count = 0 and v_mirror_count = 0 then
    update public.money_entries as current_entry
    set bucket_id = backup_entry.bucket_id
    from public.money_entries_backup_step5_20261115 as backup_entry
    where current_entry.id = backup_entry.id
      and current_entry.source_key = backup_entry.source_key
      and current_entry.bucket_id = v_usdt_id
      and backup_entry.bucket_id = v_trading_id
      and (
        (backup_entry.source = 'ACCOUNT_BUY' and backup_entry.direction = 'OUT')
        or (backup_entry.source = 'ACCOUNT_SALE' and backup_entry.direction = 'IN')
      );
    get diagnostics v_restored_count = row_count;

    insert into public.money_entries (
      id, bucket_id, direction, amount, scope, category, occurred_on, note,
      source, source_key, link_key, meta, account_id, created_at
    )
    select
      backup_entry.id, backup_entry.bucket_id, backup_entry.direction, backup_entry.amount,
      backup_entry.scope, backup_entry.category, backup_entry.occurred_on, backup_entry.note,
      backup_entry.source, backup_entry.source_key, backup_entry.link_key, backup_entry.meta,
      backup_entry.account_id, backup_entry.created_at
    from public.money_entries_backup_step5_20261115 as backup_entry
    where backup_entry.id = v_mirror_id
      and backup_entry.source_key = v_mirror_key
      and backup_entry.source = 'ACCOUNT_SALE'
      and backup_entry.bucket_id = v_usdt_id
      and not exists (
        select 1
        from public.money_entries as current_entry
        where current_entry.id = v_mirror_id
      )
    on conflict (id) do nothing;
    get diagnostics v_mirror_restored_count = row_count;

    if v_restored_count <> 5 or v_mirror_restored_count <> 1 then
      raise exception
        'Rollback guard failed: expected 5 restored and 1 mirror reinserted, got % and %; transaction rolled back.',
        v_restored_count, v_mirror_restored_count;
    end if;

    raise notice 'Restored % account bucket assignment(s) and % mirror row(s).',
      v_restored_count, v_mirror_restored_count;
  else
    raise exception
      'Rollback state is partial or unexpected: USDT entries %, Trading Capital entries %, mirror rows %.',
      v_current_usdt_count, v_current_trading_count, v_mirror_count;
  end if;
end;
$$;

commit;
notify pgrst, 'reload schema';
