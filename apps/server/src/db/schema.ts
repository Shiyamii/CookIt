// Drizzle schema, read by drizzle-kit and the client. Each domain declares its tables in
// src/modules/<domain>/<domain>.schema.ts, re-exported here; tables are added with the phase
// that needs them (see plan-site-recettes.md §3).
export * from '../modules/auth/auth.schema';
export * from '../modules/invites/invites.schema';
export * from '../modules/rate-limit/rate-limit.schema';
