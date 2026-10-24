import type { RecipeVisibility } from '@cookit/shared';
import {
  BookmarkCheck,
  BookmarkPlus,
  Check,
  ChefHat,
  Copy,
  CopyPlus,
  Download,
  Languages,
  Minus,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Markdown } from '@/components/Markdown';
import { UserAvatar } from '@/components/UserAvatar';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
import { AddToShoppingList } from '@/features/shopping/views/AddToShoppingList';
import { NotFoundPage } from '@/features/system/views/NotFoundPage';
import { useRecipeViewModel } from '../viewmodels/useRecipeViewModel';
import { RecipeContent } from './RecipeContent';
import { RecipeNotes } from './RecipeNotes';
import { RecipePhotos } from './RecipePhotos';
import { RecipePhotosManager } from './RecipePhotosManager';

const VISIBILITIES: RecipeVisibility[] = ['private', 'unlisted', 'public'];

/** A recipe: from its id (`/recipes/:id`) or from a share link (`/shared#token=…`). */
export function RecipePage({ source }: { source: 'id' | 'shared' }) {
  const { t } = useTranslation();
  const vm = useRecipeViewModel(source);

  if (vm.status === 'loading')
    return <p className="text-muted-foreground">{t('common.loading')}</p>;
  if (vm.status === 'not_found' || !vm.recipe) return <NotFoundPage />;
  const recipe = vm.recipe;

  return (
    <article className="grid grid-cols-1 gap-6">
      <header className="grid gap-3">
        <RecipePhotos images={vm.images} title={recipe.title} />
        <h1 className="text-3xl font-semibold wrap-anywhere">{recipe.title}</h1>
        {recipe.summary && <p className="text-lg wrap-anywhere">{recipe.summary}</p>}
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {!vm.isOwner && (
            <UserAvatar image={vm.ownerImage} name={vm.ownerName} className="size-6 text-xs" />
          )}
          {vm.isOwner ? (
            t('recipes.yours')
          ) : vm.signedIn && vm.ownerUsername ? (
            <Link
              to={`/members/${encodeURIComponent(vm.ownerUsername)}`}
              className="underline decoration-primary decoration-2 underline-offset-2"
            >
              {t('recipes.by', { name: vm.ownerName })}
            </Link>
          ) : (
            t('recipes.by', { name: vm.ownerName })
          )}
          {vm.incomplete && <Badge variant="secondary">{t('recipes.incomplete')}</Badge>}
        </p>
        {vm.copiedFrom && (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {vm.copiedFrom.ownerUsername ? (
              <Badge variant="secondary" asChild>
                <Link to={`/members/${encodeURIComponent(vm.copiedFrom.ownerUsername)}`}>
                  <CopyPlus aria-hidden />
                  {t('recipes.library.copyOf', { name: vm.copiedFrom.ownerName ?? '' })}
                </Link>
              </Badge>
            ) : (
              <Badge variant="secondary">
                <CopyPlus aria-hidden />
                {t('recipes.library.copyOf', { name: t('recipes.library.formerMember') })}
              </Badge>
            )}
            {vm.copiedFrom.recipeId && (
              <Link
                to={`/recipes/${vm.copiedFrom.recipeId}`}
                className="underline decoration-primary decoration-2 underline-offset-2"
              >
                {t('recipes.library.seeOriginal')}
              </Link>
            )}
          </p>
        )}
        {vm.languages.length > 1 && (
          <div
            role="group"
            aria-label={t('recipes.translate.chooseLanguage')}
            className="flex flex-wrap gap-1.5"
          >
            {vm.languages.map((language) => (
              <Button
                key={language}
                size="sm"
                variant={language === vm.lang ? 'default' : 'outline'}
                aria-pressed={language === vm.lang}
                className="rounded-full"
                onClick={() => vm.chooseLanguage(language)}
              >
                {t(`language.${language}`)}
              </Button>
            ))}
          </div>
        )}
        {recipe.description && (
          <div className="text-muted-foreground">
            <Markdown text={recipe.description} />
          </div>
        )}
        {vm.tagGroups.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label={t('recipes.tags')}>
            {vm.tagGroups.flatMap((group) =>
              group.tags.map((tag) => (
                <li key={tag.id}>
                  <Link
                    to={`/gallery?tags=${encodeURIComponent(tag.slug)}`}
                    title={group.category}
                    className="inline-block rounded-full bg-secondary px-2.5 py-0.5 text-sm text-secondary-foreground hover:underline"
                  >
                    {tag.label}
                  </Link>
                </li>
              )),
            )}
          </ul>
        )}
        {(recipe.source || recipe.extraMeta.length > 0) && (
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
            {recipe.source && (
              <>
                <dt className="text-muted-foreground">{t('recipes.fields.source')}</dt>
                <dd className="wrap-anywhere">
                  {vm.sourceHref ? (
                    <a
                      href={vm.sourceHref}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="font-medium underline decoration-primary decoration-2 underline-offset-2"
                    >
                      {recipe.source}
                    </a>
                  ) : (
                    recipe.source
                  )}
                </dd>
              </>
            )}
            {recipe.extraMeta.map(([key, value]) => (
              <div key={key} className="contents">
                <dt className="text-muted-foreground">{key}</dt>
                <dd className="wrap-anywhere">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </header>

      {vm.error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{t(`errors.${vm.error}`, t('errors.unknown'))}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium" id="servings-label">
          {t('recipes.fields.servings')}
        </span>
        <div role="group" aria-labelledby="servings-label" className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            aria-label={t('recipes.fewerServings')}
            disabled={vm.servings <= 1}
            onClick={() => vm.setServings(vm.servings - 1)}
          >
            <Minus />
          </Button>
          <output aria-live="polite" className="w-10 text-center text-lg font-semibold">
            {vm.servings}
          </output>
          <Button
            variant="outline"
            size="icon"
            aria-label={t('recipes.moreServings')}
            disabled={vm.servings >= 1000}
            onClick={() => vm.setServings(vm.servings + 1)}
          >
            <Plus />
          </Button>
        </div>
        {vm.servings !== vm.baseServings && (
          <Button
            variant="link"
            size="sm"
            className="text-foreground underline decoration-primary decoration-2"
            onClick={vm.resetServings}
          >
            {t('recipes.resetServings', { n: vm.baseServings })}
          </Button>
        )}
      </div>

      {vm.canCook && (
        <div className="grid gap-1.5">
          {vm.incomplete ? (
            <>
              <Button size="lg" className="justify-self-start" disabled>
                <ChefHat /> {t('recipes.cook')}
              </Button>
              <p className="text-sm text-muted-foreground">{t('recipes.cookIncomplete')}</p>
            </>
          ) : (
            <Button size="lg" className="justify-self-start" asChild>
              <Link to={vm.cookHref}>
                <ChefHat /> {t('recipes.cook')}
              </Link>
            </Button>
          )}
        </div>
      )}
      {vm.signedIn && !vm.canCook && vm.canCopy && (
        <p className="text-sm text-muted-foreground">{t('recipes.cookShared')}</p>
      )}
      {vm.canCopy && (
        <section className="grid gap-3 rounded-lg border p-4" aria-labelledby="library-title">
          <h2 id="library-title" className="flex items-center gap-2 font-semibold">
            {vm.saved && <BookmarkCheck className="size-5" aria-hidden />}
            {vm.saved ? t('recipes.library.savedTitle') : t('recipes.library.title')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {vm.saved ? t('recipes.library.savedText') : t('recipes.library.text')}
          </p>
          <div className="flex flex-wrap gap-2">
            {vm.saved ? (
              <Button variant="outline" onClick={vm.removeFromMyRecipes} disabled={vm.busy}>
                {t('recipes.library.remove')}
              </Button>
            ) : (
              <Button onClick={vm.addToMyRecipes} disabled={vm.busy}>
                <BookmarkPlus /> {t('recipes.library.add')}
              </Button>
            )}
            <Button variant="outline" onClick={vm.askCopy} disabled={vm.busy}>
              <CopyPlus /> {t('recipes.library.copy')}
            </Button>
          </div>
        </section>
      )}
      {vm.signedIn && vm.document && vm.lang && (
        <AddToShoppingList
          recipeId={vm.id}
          title={recipe.title}
          lang={vm.lang}
          servings={vm.servings}
          document={vm.document}
        />
      )}

      <RecipeContent recipe={recipe} durationText={vm.durationText} />

      {vm.notes && <RecipeNotes {...vm.notes} />}

      {vm.isOwner && (
        <section className="grid gap-4 rounded-lg border p-4" aria-labelledby="manage-title">
          <h2 id="manage-title" className="font-semibold">
            {t('recipes.manage')}
          </h2>
          <div className="grid gap-2">
            <Label htmlFor="visibility">{t('recipes.visibility.label')}</Label>
            <Select
              value={vm.visibility}
              onValueChange={(value) => vm.changeVisibility(value as RecipeVisibility)}
              disabled={vm.busy}
            >
              <SelectTrigger id="visibility" className="h-11 w-full sm:w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VISIBILITIES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`recipes.visibility.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {t(`recipes.visibility.${vm.visibility}Hint`)}
            </p>
          </div>
          <RecipePhotosManager recipeId={vm.id} images={vm.images} />
          {vm.shareUrl && (
            <div className="flex gap-2">
              <Input
                readOnly
                value={vm.shareUrl}
                aria-label={t('recipes.shareLink')}
                className="h-11 font-mono text-xs"
                onFocus={(event) => event.target.select()}
              />
              <Button variant="outline" size="lg" onClick={() => void vm.copyShareUrl()}>
                {vm.copied ? <Check /> : <Copy />}
                {vm.copied ? t('common.copied') : t('common.copy')}
              </Button>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link to={`/recipes/${vm.id}/edit`}>
                <Pencil />{' '}
                {vm.isTranslation && vm.baseLang
                  ? t('recipes.translate.editBase', { language: t(`language.${vm.baseLang}`) })
                  : t('recipes.edit')}
              </Link>
            </Button>
            {vm.isTranslation && vm.lang && (
              <Button variant="outline" asChild>
                <Link to={`/recipes/${vm.id}/translate/${vm.lang}`}>
                  <Languages />{' '}
                  {t('recipes.translate.editLink', { language: t(`language.${vm.lang}`) })}
                </Link>
              </Button>
            )}
            {vm.missingLanguages.map((language) => (
              <Button key={language} variant="outline" asChild>
                <Link to={`/recipes/${vm.id}/translate/${language}`}>
                  <Languages />{' '}
                  {t('recipes.translate.addLink', { language: t(`language.${language}`) })}
                </Link>
              </Button>
            ))}
            <Button variant="destructive" onClick={vm.askDelete} disabled={vm.busy}>
              <Trash2 /> {t('recipes.delete')}
            </Button>
          </div>
        </section>
      )}

      <Button variant="outline" className="justify-self-start" onClick={vm.exportMarkdown}>
        <Download /> {t('recipes.exportOne')}
      </Button>

      {!vm.signedIn && <p className="text-sm text-muted-foreground">{t('recipes.signInToCopy')}</p>}

      <AlertDialog open={vm.confirmCopy} onOpenChange={(open) => !open && vm.cancelCopy()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('recipes.library.copyTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('recipes.library.copyText', { name: vm.ownerName })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={vm.makeCopy}>
              {t('recipes.library.copyConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={vm.confirmDelete} onOpenChange={(open) => !open && vm.cancelDelete()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('recipes.deleteTitle', { title: recipe.title })}</AlertDialogTitle>
            <AlertDialogDescription>{t('recipes.deleteText')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={vm.deleteRecipe}>
              {t('recipes.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}
