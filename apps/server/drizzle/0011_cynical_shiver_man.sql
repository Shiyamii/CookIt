ALTER TABLE "password_resets" ADD COLUMN "kind" text DEFAULT 'admin' NOT NULL;--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "locale" text;