CREATE TABLE "recipe_tags" (
	"recipe_id" text NOT NULL,
	"tag_id" text NOT NULL,
	CONSTRAINT "recipe_tags_recipe_id_tag_id_pk" PRIMARY KEY("recipe_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "seeds" (
	"name" text PRIMARY KEY NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tag_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"position" integer NOT NULL,
	"multiple" boolean DEFAULT false NOT NULL,
	"labels" jsonb NOT NULL,
	CONSTRAINT "tag_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" text PRIMARY KEY NOT NULL,
	"category_id" text NOT NULL,
	"slug" text NOT NULL,
	"position" integer NOT NULL,
	"labels" jsonb NOT NULL,
	CONSTRAINT "tags_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"rounding" text NOT NULL,
	"position" integer NOT NULL,
	"labels" jsonb NOT NULL,
	"aliases" jsonb NOT NULL,
	CONSTRAINT "units_slug_unique" UNIQUE("slug"),
	CONSTRAINT "units_rounding_check" CHECK ("units"."rounding" in ('decimal', 'fraction'))
);
--> statement-breakpoint
ALTER TABLE "recipe_tags" ADD CONSTRAINT "recipe_tags_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_tags" ADD CONSTRAINT "recipe_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_category_id_tag_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."tag_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recipe_tags_tag_idx" ON "recipe_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "tags_category_idx" ON "tags" USING btree ("category_id","position");