CREATE TABLE "recipe_translations" (
	"recipe_id" text NOT NULL,
	"lang" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"extra_meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"body_markdown" text DEFAULT '' NOT NULL,
	"search_text" text DEFAULT '' NOT NULL,
	"search" "tsvector" GENERATED ALWAYS AS (to_tsvector((case lang when 'fr' then 'french'::regconfig else 'english'::regconfig end), search_text)) STORED,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_translations_recipe_id_lang_pk" PRIMARY KEY("recipe_id","lang"),
	CONSTRAINT "recipe_translations_lang_check" CHECK ("recipe_translations"."lang" in ('fr', 'en'))
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"slug" text NOT NULL,
	"base_lang" text NOT NULL,
	"servings" integer NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"share_token" text,
	"source_url" text,
	"copied_from_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipes_share_token_unique" UNIQUE("share_token"),
	CONSTRAINT "recipes_owner_slug_unique" UNIQUE("owner_id","slug"),
	CONSTRAINT "recipes_visibility_check" CHECK ("recipes"."visibility" in ('private', 'unlisted', 'public')),
	CONSTRAINT "recipes_base_lang_check" CHECK ("recipes"."base_lang" in ('fr', 'en')),
	CONSTRAINT "recipes_servings_check" CHECK ("recipes"."servings" between 1 and 1000)
);
--> statement-breakpoint
ALTER TABLE "recipe_translations" ADD CONSTRAINT "recipe_translations_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recipe_translations_search_idx" ON "recipe_translations" USING gin ("search");--> statement-breakpoint
CREATE INDEX "recipes_owner_idx" ON "recipes" USING btree ("owner_id","updated_at");--> statement-breakpoint
CREATE INDEX "recipes_public_idx" ON "recipes" USING btree ("updated_at") WHERE "recipes"."visibility" = 'public';