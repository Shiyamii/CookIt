// Drizzle schema, read by drizzle-kit and the client. Each domain declares its tables in
// src/modules/<domain>/<domain>.schema.ts, re-exported here; tables are added with the phase
// that needs them (see plan-site-recettes.md §3).
export * from '../modules/auth/auth.schema';
export * from '../modules/cooking/cooking.schema';
export * from '../modules/invites/invites.schema';
export * from '../modules/profile/profile.schema';
export * from '../modules/push/push.schema';
export * from '../modules/rate-limit/rate-limit.schema';
export * from '../modules/recipes/recipes.schema';
export * from '../modules/system/system.schema';
export * from '../modules/tags/tags.schema';
export * from '../modules/units/units.schema';
