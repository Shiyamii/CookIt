import { customType } from 'drizzle-orm/pg-core';

/** Binary data (pictures): `bytea`, read and written as a Buffer by the `postgres` driver. */
export const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });
