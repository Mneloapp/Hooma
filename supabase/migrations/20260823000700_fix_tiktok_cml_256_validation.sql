-- Apply the same PostgreSQL-safe 256-character validation to CML account and
-- sound IDs. This changes validation only and performs no provider action.

begin;

do $repair$
declare
  original_definition text;
  repaired_definition text;
  account_pattern text :=
    'or requested_account_id !~ ''^[A-Za-z0-9._:~-]{1,256}$''';
  account_replacement text :=
    'or char_length(requested_account_id) not between 1 and 256
    or requested_account_id !~ ''^[A-Za-z0-9._:~-]+$''';
  sound_pattern text :=
    'or receipt #>> ''{track,musicSoundId}'' !~ ''^[A-Za-z0-9._:~-]{1,256}$''';
  sound_replacement text :=
    'or char_length(receipt #>> ''{track,musicSoundId}'') not between 1 and 256
    or receipt #>> ''{track,musicSoundId}'' !~ ''^[A-Za-z0-9._:~-]+$''';
begin
  select pg_get_functiondef(
    'public.social_tiktok_cml_receipt_v1_is_valid(jsonb,text,text,text,text,text)'::regprocedure
  ) into original_definition;

  if position(account_pattern in original_definition) = 0
    or position(sound_pattern in original_definition) = 0
  then
    raise exception 'TIKTOK_CML_256_VALIDATION_SOURCE_MISMATCH';
  end if;

  repaired_definition := replace(original_definition, account_pattern, account_replacement);
  repaired_definition := replace(repaired_definition, sound_pattern, sound_replacement);
  execute repaired_definition;
end;
$repair$;

comment on function public.social_tiktok_cml_receipt_v1_is_valid(
  jsonb, text, text, text, text, text
) is 'Validates the exact TikTok CML receipt with explicit 256-character account and sound ID bounds.';

commit;
