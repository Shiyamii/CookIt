// mjml ships no types (its @types package lags behind): only what the email script uses.
declare module 'mjml' {
  export default function mjml2html(
    input: string,
    options?: { validationLevel?: 'strict' | 'soft' | 'skip'; minify?: boolean },
  ): { html: string; errors: unknown[] } | Promise<{ html: string; errors: unknown[] }>;
}
