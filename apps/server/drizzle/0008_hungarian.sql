ALTER TABLE "user" DROP CONSTRAINT "user_locale_check";--> statement-breakpoint
ALTER TABLE "recipe_translations" DROP CONSTRAINT "recipe_translations_lang_check";--> statement-breakpoint
ALTER TABLE "recipes" DROP CONSTRAINT "recipes_base_lang_check";--> statement-breakpoint
ALTER TABLE "recipe_translations" drop column "search";--> statement-breakpoint
ALTER TABLE "recipe_translations" ADD COLUMN "search" "tsvector" GENERATED ALWAYS AS (to_tsvector((case lang when 'fr' then 'french'::regconfig when 'hu' then 'hungarian'::regconfig else 'english'::regconfig end), search_text)) STORED;--> statement-breakpoint
CREATE INDEX "recipe_translations_search_idx" ON "recipe_translations" USING gin ("search");--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_locale_check" CHECK ("user"."locale" in ('fr', 'en', 'hu'));--> statement-breakpoint
ALTER TABLE "recipe_translations" ADD CONSTRAINT "recipe_translations_lang_check" CHECK ("recipe_translations"."lang" in ('fr', 'en', 'hu'));--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_base_lang_check" CHECK ("recipes"."base_lang" in ('fr', 'en', 'hu'));