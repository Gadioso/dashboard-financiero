begin;

alter table public.financial_import_batches
  drop constraint if exists financial_import_batches_source_type_check;

alter table public.financial_import_batches
  add constraint financial_import_batches_source_type_check
  check (source_type in ('xlsx', 'csv', 'pdf', 'image'));

update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/webp'
]::text[]
where id = 'financial-imports';

commit;
