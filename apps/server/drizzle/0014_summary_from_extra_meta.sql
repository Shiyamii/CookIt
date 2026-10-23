-- `résumé:` / `summary:` / `összefoglaló:` lines used to be free "other information" lines
-- (`extra_meta`); they are now the recipe's summary. Each one becomes the summary when it fits
-- (160 characters, no summary yet), else its text goes to the end of the description: nothing is
-- lost, and no stored recipe keeps a key the parser would now read differently.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT t.recipe_id, t.lang, e.key, e.value
    FROM recipe_translations t, jsonb_each_text(t.extra_meta) e
    WHERE lower(e.key) IN (
      'résumé', 'resume', 'résume', 'resumé', 'summary',
      'összefoglaló', 'osszefoglalo', 'összefoglalo', 'összegzés', 'osszegzes'
    )
  LOOP
    UPDATE recipe_translations
    SET
      summary = CASE
        WHEN summary = '' AND char_length(r.value) <= 160 THEN r.value
        ELSE summary
      END,
      description = CASE
        WHEN summary = '' AND char_length(r.value) <= 160 THEN description
        ELSE btrim(description || E'\n\n' || r.value)
      END,
      extra_meta = extra_meta - r.key
    WHERE recipe_id = r.recipe_id AND lang = r.lang;
  END LOOP;
END $$;
