-- The linked database has a short statement timeout. Keep each batch bounded,
-- while allowing this explicitly confirmed Owner/Admin maintenance RPC enough
-- time to update indexed product rows and their related storefront state.

alter function public.move_catalog_products_to_draft_batch_v1(uuid, text, integer)
  set statement_timeout = '30s';
