-- Support foreign-key checks and joins without scanning the raw transaction table.
create index if not exists bank_transactions_raw_account_id_idx
  on public.bank_transactions_raw (account_id);

create index if not exists bank_transactions_raw_gasto_id_idx
  on public.bank_transactions_raw (gasto_id)
  where gasto_id is not null;

create index if not exists bank_transactions_raw_ingreso_id_idx
  on public.bank_transactions_raw (ingreso_id)
  where ingreso_id is not null;
