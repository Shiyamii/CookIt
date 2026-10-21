ALTER TABLE "recipes" ADD COLUMN "has_steps" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Existing recipes: a step is a numbered line after the separator of `body_markdown` (canonical form).
UPDATE "recipes" SET "has_steps" = true FROM "recipe_translations" t WHERE t."recipe_id" = "recipes"."id" AND t."lang" = "recipes"."base_lang" AND substring(t."body_markdown" from '(?:^|\n)---\n\n([\s\S]*)$') ~ '(^|\n)[0-9]+\. ';
