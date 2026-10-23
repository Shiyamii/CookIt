CREATE TABLE "recipe_notes" (
	"user_id" text NOT NULL,
	"recipe_id" text NOT NULL,
	"text" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_notes_user_id_recipe_id_pk" PRIMARY KEY("user_id","recipe_id")
);
--> statement-breakpoint
ALTER TABLE "recipe_translations" ADD COLUMN "summary" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "author_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "recipe_notes" ADD CONSTRAINT "recipe_notes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_notes" ADD CONSTRAINT "recipe_notes_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;