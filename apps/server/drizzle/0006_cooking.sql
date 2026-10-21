CREATE TABLE "cook_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"state" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "timers" (
	"cook_session_id" text NOT NULL,
	"id" text NOT NULL,
	"recipe_id" text,
	"recipe_title" text DEFAULT '' NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"duration_seconds" integer NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "timers_cook_session_id_id_pk" PRIMARY KEY("cook_session_id","id"),
	CONSTRAINT "timers_status_check" CHECK ("timers"."status" in ('running', 'done', 'cancelled'))
);
--> statement-breakpoint
ALTER TABLE "cook_sessions" ADD CONSTRAINT "cook_sessions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timers" ADD CONSTRAINT "timers_cook_session_id_cook_sessions_id_fk" FOREIGN KEY ("cook_session_id") REFERENCES "public"."cook_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cook_sessions_active_unique" ON "cook_sessions" USING btree ("user_id") WHERE "cook_sessions"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "timers_due_idx" ON "timers" USING btree ("ends_at") WHERE "timers"."status" = 'running' and "timers"."notified_at" is null;