CREATE TABLE "alarm_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"settings" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "timers_due_idx";--> statement-breakpoint
ALTER TABLE "timers" ADD COLUMN "sends" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "alarm_settings" ADD CONSTRAINT "alarm_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "timers_due_idx" ON "timers" USING btree ("ends_at") WHERE "timers"."status" = 'running';