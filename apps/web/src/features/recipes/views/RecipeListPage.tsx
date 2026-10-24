import { Download, Plus, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRecipeListViewModel } from '../viewmodels/useRecipeListViewModel';
import { RecipeCard } from './RecipeCard';

/** My recipes (`/recipes`) or the public gallery (`/gallery`), with search. */
export function RecipeListPage({ kind }: { kind: 'mine' | 'gallery' }) {
  const { t } = useTranslation();
  const vm = useRecipeListViewModel(kind);
  const mine = kind === 'mine';

  return (
    <div className="grid grid-cols-1 gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">
          {mine ? t('recipes.mine.title') : t('recipes.gallery.title')}
        </h1>
        {mine && (
          <Button asChild className="ml-auto">
            <Link to="/recipes/new">
              <Plus /> {t('recipes.new')}
            </Link>
          </Button>
        )}
      </div>
      {!mine && <p className="text-muted-foreground">{t('recipes.gallery.subtitle')}</p>}
      {mine && (
        <div role="group" aria-label={t('recipes.scope.label')} className="flex flex-wrap gap-1.5">
          {vm.scopes.map((value) => (
            <Button
              key={value}
              size="sm"
              variant={value === vm.scope ? 'default' : 'outline'}
              aria-pressed={value === vm.scope}
              className="rounded-full"
              onClick={() => vm.chooseScope(value)}
            >
              {t(`recipes.scope.${value}`)}
            </Button>
          ))}
        </div>
      )}

      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          aria-label={t('recipes.search')}
          placeholder={t('recipes.searchPlaceholder')}
          className="h-11 pl-9"
          value={vm.search}
          onChange={(event) => vm.setSearch(event.target.value)}
        />
      </div>

      {vm.filterGroups.length > 0 && (
        <details className="rounded-lg border px-3 py-2" open={vm.selectedTagCount > 0}>
          <summary className="cursor-pointer py-1 text-sm font-medium">
            {t('recipes.filters.title')}
            {vm.selectedTagCount > 0 && ` (${vm.selectedTagCount})`}
          </summary>
          <div className="grid gap-3 py-2">
            {vm.filterGroups.map((group) => (
              <div key={group.id} className="grid gap-1.5">
                <p className="text-sm text-muted-foreground">{group.label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {group.tags.map((tag) => (
                    <Button
                      key={tag.slug}
                      size="sm"
                      variant={tag.selected ? 'default' : 'outline'}
                      aria-pressed={tag.selected}
                      className="rounded-full"
                      onClick={() => vm.toggleTag(tag.slug)}
                    >
                      {tag.label}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
            {vm.selectedTagCount > 0 && (
              <Button
                variant="link"
                size="sm"
                className="justify-self-start text-foreground underline decoration-primary decoration-2"
                onClick={vm.clearTags}
              >
                {t('recipes.filters.clear')}
              </Button>
            )}
          </div>
        </details>
      )}

      {vm.loading && <p className="text-muted-foreground">{t('common.loading')}</p>}
      {vm.loadError && <p className="text-destructive">{t('errors.unknown')}</p>}
      {!vm.loading && !vm.loadError && vm.recipes.length === 0 && (
        <p className="text-muted-foreground">
          {vm.searching
            ? t('recipes.noResults')
            : mine
              ? vm.scope === 'saved'
                ? t('recipes.mine.emptySaved')
                : t('recipes.mine.empty')
              : t('recipes.gallery.empty')}
        </p>
      )}

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {vm.recipes.map((recipe) => (
          <li key={recipe.id} data-testid="recipe-card">
            <RecipeCard recipe={recipe} showOwner={!mine} />
          </li>
        ))}
      </ul>

      {mine && vm.recipes.length > 0 && (
        <Button asChild variant="outline" className="justify-self-start">
          <a href={vm.exportAllUrl} download>
            <Download /> {t('recipes.exportAll')}
          </a>
        </Button>
      )}

      {vm.hasMore && (
        <Button
          variant="outline"
          className="justify-self-center"
          onClick={vm.loadMore}
          disabled={vm.loadingMore}
        >
          {t('recipes.loadMore')}
        </Button>
      )}
    </div>
  );
}
