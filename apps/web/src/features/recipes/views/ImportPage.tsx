import { SUPPORTED_LOCALES, type Locale } from '@cookit/shared';
import { Check, Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useImportViewModel, type ImportTab } from '../viewmodels/useImportViewModel';
import { DiagnosticsList } from './DiagnosticsList';
import { RecipeContent } from './RecipeContent';

type Vm = ReturnType<typeof useImportViewModel>;
type Item = Vm['items'][number];

/** "Import with an AI" (plan §5.2): the import page opened on its AI tab. */
export function ImportAiPage() {
  return <ImportPage initialTab="ai" />;
}

/**
 * Import recipes: markdown (pasted, `.md`, zip), a web page or an AI's answer; preview, tags,
 * then save.
 */
export function ImportPage({ initialTab = 'text' }: { initialTab?: ImportTab }) {
  const { t } = useTranslation();
  const vm = useImportViewModel(initialTab);

  return (
    <div className="grid grid-cols-1 gap-5">
      <h1 className="text-2xl font-semibold">{t('recipes.import.title')}</h1>

      {vm.items.length === 0 ? (
        <>
          <Tabs value={vm.tab} onValueChange={(value) => vm.setTab(value as ImportTab)}>
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="text">{t('recipes.import.tabs.text')}</TabsTrigger>
              <TabsTrigger value="file">{t('recipes.import.tabs.file')}</TabsTrigger>
              <TabsTrigger value="url">{t('recipes.import.tabs.url')}</TabsTrigger>
              <TabsTrigger value="ai">{t('recipes.import.tabs.ai')}</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="grid gap-2">
            <Label htmlFor="import-lang">{t('recipes.fields.lang')}</Label>
            <Select value={vm.lang} onValueChange={(value) => vm.setLang(value as Locale)}>
              <SelectTrigger id="import-lang" className="h-11 w-full sm:w-60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_LOCALES.map((locale) => (
                  <SelectItem key={locale} value={locale}>
                    {t(`language.${locale}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {vm.error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>
                {t(
                  `recipes.import.errors.${vm.error}`,
                  t(`errors.${vm.error}`, t('errors.unknown')),
                )}
              </AlertDescription>
            </Alert>
          )}

          {vm.tab === 'text' && (
            <div className="grid gap-2">
              <Label htmlFor="import-text">{t('recipes.import.pasteLabel')}</Label>
              <Textarea
                id="import-text"
                rows={12}
                className="font-mono text-sm wrap-anywhere"
                value={vm.text}
                onChange={(event) => vm.setText(event.target.value)}
              />
              <Button
                className="justify-self-start"
                disabled={!vm.text.trim()}
                onClick={vm.analyzeText}
              >
                {t('recipes.import.preview')}
              </Button>
            </div>
          )}
          {vm.tab === 'file' && (
            <div className="grid gap-2">
              <Label htmlFor="import-file">{t('recipes.import.fileLabel')}</Label>
              <Input
                id="import-file"
                type="file"
                accept=".md,.markdown,.txt,.zip,text/markdown,application/zip"
                className="h-11"
                disabled={vm.reading}
                onChange={(event) => void vm.readFile(event.target.files?.[0])}
              />
              <p className="text-sm text-muted-foreground">{t('recipes.import.fileHint')}</p>
            </div>
          )}
          {vm.tab === 'ai' && (
            <div className="grid gap-4">
              <p className="text-sm text-muted-foreground">{t('recipes.ai.importText')}</p>
              <div className="grid gap-2">
                <Button className="justify-self-start" onClick={() => void vm.copyPrompt()}>
                  {vm.copied ? <Check /> : <Copy />}
                  {vm.copied ? t('common.copied') : t('recipes.ai.copyPrompt')}
                </Button>
                <details>
                  <summary className="cursor-pointer text-sm font-medium">
                    {t('recipes.ai.showPrompt')}
                  </summary>
                  <Textarea
                    readOnly
                    aria-label={t('recipes.ai.prompt')}
                    rows={10}
                    className="mt-2 font-mono text-xs wrap-anywhere"
                    value={vm.prompt}
                    onFocus={(event) => event.target.select()}
                  />
                </details>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="import-answer">{t('recipes.ai.answerLabel')}</Label>
                <Textarea
                  id="import-answer"
                  rows={12}
                  className="font-mono text-sm wrap-anywhere"
                  placeholder={t('recipes.ai.answerPlaceholder')}
                  value={vm.answer}
                  onChange={(event) => vm.setAnswer(event.target.value)}
                />
                <Button
                  className="justify-self-start"
                  disabled={!vm.answer.trim()}
                  onClick={vm.analyzeAnswer}
                >
                  {t('recipes.import.preview')}
                </Button>
              </div>
            </div>
          )}
          {vm.tab === 'url' && (
            <div className="grid gap-2">
              <Label htmlFor="import-url">{t('recipes.import.urlLabel')}</Label>
              <Input
                id="import-url"
                type="url"
                inputMode="url"
                className="h-11"
                placeholder="https://…"
                value={vm.url}
                onChange={(event) => vm.setUrl(event.target.value)}
              />
              <p className="text-sm text-muted-foreground">{t('recipes.import.urlHint')}</p>
              <Button
                className="justify-self-start"
                disabled={!vm.url.trim() || vm.reading}
                onClick={vm.fetchUrl}
              >
                {t('recipes.import.fetch')}
              </Button>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="text-muted-foreground">
            {t('recipes.import.found', { count: vm.items.length })}
          </p>
          {vm.items.map((item) => (
            <ImportItem key={item.id} vm={vm} item={item} single={vm.items.length === 1} />
          ))}
          <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-2 border-t bg-background/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
            <Button onClick={vm.save} disabled={vm.saving || vm.readyCount === 0}>
              {t('recipes.import.save', { count: vm.readyCount })}
            </Button>
            <Button variant="ghost" onClick={vm.reset}>
              {t('recipes.import.startOver')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function ImportItem({ vm, item, single }: { vm: Vm; item: Item; single: boolean }) {
  const { t } = useTranslation();
  return (
    <section
      className="grid min-w-0 gap-4 rounded-lg border p-4"
      data-testid="import-item"
      aria-label={item.preview?.title ?? item.name}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="min-w-0 flex-1 text-lg font-semibold wrap-anywhere">
          {item.preview?.title ?? item.name}
        </h2>
        {item.status === 'saved' && <Badge>{t('recipes.import.saved')}</Badge>}
        {item.status === 'failed' && (
          <Badge variant="destructive">{t(`errors.${item.error}`, t('errors.unknown'))}</Badge>
        )}
        {!item.ok && <Badge variant="destructive">{t('recipes.import.notReadable')}</Badge>}
      </div>

      <DiagnosticsList diagnostics={item.diagnostics} />

      {single && (
        <details open={!item.ok}>
          <summary className="cursor-pointer text-sm font-medium">
            {t('recipes.import.editText')}
          </summary>
          <Textarea
            aria-label={t('recipes.editor.markdown')}
            rows={12}
            className="mt-2 font-mono text-sm wrap-anywhere"
            value={item.markdown}
            onChange={(event) => vm.editMarkdown(item.id, event.target.value)}
          />
        </details>
      )}

      {item.ok && (
        <>
          <fieldset
            className="grid min-w-0 gap-3 rounded-md bg-muted/40 p-3"
            data-testid="tag-review"
          >
            <legend className="px-1 text-sm font-semibold">
              {t('recipes.import.validateTags')}
            </legend>
            {item.review.ambiguous.map((entry) => (
              <div key={entry.value} className="grid gap-1.5" role="group" aria-label={entry.value}>
                <p className="text-sm">{t('recipes.import.ambiguous', { value: entry.value })}</p>
                <div className="flex flex-wrap gap-1.5">
                  {entry.candidates.map((tag) => (
                    <Button
                      key={tag.id}
                      size="sm"
                      variant="outline"
                      className="rounded-full"
                      onClick={() => vm.toggleTag(item.id, tag.id)}
                    >
                      {tag.label}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
            {item.review.ignored.length > 0 && (
              <p className="text-sm wrap-anywhere text-muted-foreground" data-testid="ignored-tags">
                {t('recipes.import.ignored', { values: item.review.ignored.join(', ') })}
              </p>
            )}
            {item.pickers.map((picker) => (
              <div key={picker.id} className="grid gap-1.5" role="group" aria-label={picker.label}>
                <p className="text-sm text-muted-foreground">{picker.label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {picker.tags.map((tag) => (
                    <Button
                      key={tag.id}
                      size="sm"
                      variant={tag.selected ? 'default' : 'outline'}
                      aria-pressed={tag.selected}
                      className="rounded-full"
                      onClick={() => vm.toggleTag(item.id, tag.id)}
                    >
                      {tag.label}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </fieldset>

          {item.preview && (
            <details open={single}>
              <summary className="cursor-pointer text-sm font-medium">
                {t('recipes.editor.preview')}
              </summary>
              <div className="mt-3">
                <RecipeContent recipe={item.preview} durationText={vm.durationText} />
              </div>
            </details>
          )}
        </>
      )}
    </section>
  );
}
