-- Make global Catalog Agent duplicate checks efficient for canonical URLs and stable source model IDs.

update public.source_imports
set source_model_id = substring(source_url from '/models/([0-9]+)')
where platform = 'makerworld'
  and source_model_id is null
  and source_url ~ '/models/[0-9]+';

update public.product_sources
set source_model_id = substring(source_url from '/models/([0-9]+)')
where platform = 'makerworld'
  and source_model_id is null
  and source_url ~ '/models/[0-9]+';

create index if not exists idx_source_imports_platform_model
  on public.source_imports(platform, source_model_id)
  where source_model_id is not null;

create index if not exists idx_product_sources_platform_model
  on public.product_sources(platform, source_model_id)
  where source_model_id is not null;
