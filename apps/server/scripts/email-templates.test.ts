import { describe, expect, test } from 'bun:test';
import { TEMPLATES } from '../src/modules/mail/templates.generated';
import { compileTemplates, oklchToHex, themeValues } from './email-templates';

describe('email templates', () => {
  test('the compiled templates are up to date (run `bun run emails` after a change)', async () => {
    expect(await compileTemplates()).toEqual({ ...TEMPLATES });
  });

  test('theme colors become sRGB hex', () => {
    expect(oklchToHex('oklch(0 0 0)')).toBe('#000000');
    expect(oklchToHex('oklch(1 0 0)')).toBe('#ffffff');
    // The theme's primary green, as in the PWA manifest.
    expect(oklchToHex('oklch(0.783 0.0384 132.737)')).toBe('#afbea5');
  });

  test('the theme gives every color the templates use', async () => {
    const theme = await themeValues();
    for (const value of Object.values(theme)) expect(value).toMatch(/^(#[0-9a-f]{6}|\d+px)$/);
    expect(theme.primary).toBe('#afbea5');
  });
});
