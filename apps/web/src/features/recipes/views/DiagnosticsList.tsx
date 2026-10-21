import type { Diagnostic } from '@cookit/shared';
import { CircleAlert, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** Parser errors and warnings, translated, with their line numbers (most important first). */
export function DiagnosticsList({ diagnostics }: { diagnostics: Diagnostic[] }) {
  const { t } = useTranslation();
  if (diagnostics.length === 0) return null;
  const sorted = [...diagnostics].sort(
    (a, b) =>
      (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1) ||
      (a.line ?? 0) - (b.line ?? 0),
  );
  return (
    <ul className="grid gap-1.5 text-sm" aria-label={t('recipes.editor.problems')}>
      {sorted.map((diagnostic, index) => {
        const error = diagnostic.severity === 'error';
        const Icon = error ? CircleAlert : TriangleAlert;
        return (
          <li
            key={index}
            className={error ? 'flex gap-2 text-destructive' : 'flex gap-2 text-muted-foreground'}
          >
            <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span className="min-w-0 wrap-anywhere">
              <span className="sr-only">
                {error ? t('recipes.editor.error') : t('recipes.editor.warning')}{' '}
              </span>
              {diagnostic.line !== undefined && (
                <span className="font-medium">
                  {t('recipes.editor.line', { n: diagnostic.line })}{' '}
                </span>
              )}
              {t(`diagnostics.${diagnostic.code}`, {
                ...diagnostic.params,
                defaultValue: diagnostic.code,
              })}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
