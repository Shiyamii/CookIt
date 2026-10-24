CREATE TABLE "saved_recipes" (
	"user_id" text NOT NULL,
	"recipe_id" text NOT NULL,
	"share_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_recipes_user_id_recipe_id_pk" PRIMARY KEY("user_id","recipe_id")
);
--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "copied_from_owner_id" text;--> statement-breakpoint
ALTER TABLE "saved_recipes" ADD CONSTRAINT "saved_recipes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_recipes" ADD CONSTRAINT "saved_recipes_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "saved_recipes_recipe_idx" ON "saved_recipes" USING btree ("recipe_id");--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_copied_from_owner_id_user_id_fk" FOREIGN KEY ("copied_from_owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Copies made before: their author is the original's owner, while the original still exists.
UPDATE "recipes" AS "copy" SET "copied_from_owner_id" = "original"."owner_id" FROM "recipes" AS "original" WHERE "copy"."copied_from_id" = "original"."id";
