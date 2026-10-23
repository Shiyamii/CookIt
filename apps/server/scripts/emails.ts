// Tooling (not shipped): `bun run emails` after changing an email template or the web theme.
import { writeFile } from 'node:fs/promises';
import { compileTemplates, generatedSource, OUTPUT } from './email-templates';

await writeFile(OUTPUT, generatedSource(await compileTemplates()));
console.log(`Written ${OUTPUT}`);
