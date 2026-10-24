CREATE TABLE "instance_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"public_gallery" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instance_settings_single_row" CHECK ("instance_settings"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "listed" boolean DEFAULT false NOT NULL;