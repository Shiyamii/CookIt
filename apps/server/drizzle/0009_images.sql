CREATE TABLE "avatars" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"content_type" text NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "avatars_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "avatars_type_check" CHECK ("avatars"."content_type" in ('image/webp', 'image/jpeg'))
);
--> statement-breakpoint
CREATE TABLE "recipe_images" (
	"id" text PRIMARY KEY NOT NULL,
	"recipe_id" text NOT NULL,
	"position" integer NOT NULL,
	"content_type" text NOT NULL,
	"data" "bytea" NOT NULL,
	"thumb" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_images_type_check" CHECK ("recipe_images"."content_type" in ('image/webp', 'image/jpeg'))
);
--> statement-breakpoint
ALTER TABLE "avatars" ADD CONSTRAINT "avatars_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_images" ADD CONSTRAINT "recipe_images_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recipe_images_recipe_idx" ON "recipe_images" USING btree ("recipe_id","position");