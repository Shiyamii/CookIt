import type { Context } from 'hono';
import type { z } from 'zod';

export type Parsed<T> = { ok: true; data: T } | { ok: false; response: Response };

/** Parses the JSON body with a shared Zod schema; a 400 response describes what is wrong. */
export async function parseJson<S extends z.ZodType>(
  c: Context,
  schema: S,
): Promise<Parsed<z.infer<S>>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return { ok: false, response: c.json({ error: 'invalid_json' }, 400) };
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join('.'));
    return { ok: false, response: c.json({ error: 'invalid_input', fields }, 400) };
  }
  return { ok: true, data: result.data };
}
