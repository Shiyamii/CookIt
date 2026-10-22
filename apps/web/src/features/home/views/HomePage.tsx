import {
  BellRing,
  ChefHat,
  ChevronRight,
  Lightbulb,
  Plus,
  RefreshCw,
  ShoppingCart,
  Timer,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ColorDot } from '@/components/ColorDot';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RecipeCard } from '@/features/recipes/views/RecipeCard';
import { useHomeViewModel } from '../viewmodels/useHomeViewModel';

type Vm = ReturnType<typeof useHomeViewModel>;

export function HomePage() {
  const { t } = useTranslation();
  const vm = useHomeViewModel();

  if (vm.status === 'loading')
    return <p className="text-muted-foreground">{t('common.loading')}</p>;
  if (vm.status === 'signed_out') return <Welcome vm={vm} />;

  return (
    <div className="grid grid-cols-1 gap-8">
      <h1 className="text-3xl font-semibold wrap-anywhere">{t('home.hello', { name: vm.name })}</h1>
      {vm.cooking && <Cooking cooking={vm.cooking} />}
      {vm.toBuy > 0 && <Shopping count={vm.toBuy} />}
      <Idea vm={vm} />
      <Recent vm={vm} />
    </div>
  );
}

/** Signed out: what CookIt is, the server status, where to go. */
function Welcome({ vm }: { vm: Vm }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        {/* CardTitle renders a <div>: the page still needs a real <h1> for screen readers. */}
        <CardTitle className="text-2xl">
          <h1>{t('home.title')}</h1>
        </CardTitle>
        <CardDescription>{t('home.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/login">{t('auth.login.title')}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/gallery">{t('home.browseGallery')}</Link>
          </Button>
        </div>
        <div className="flex items-center justify-between gap-4 text-sm">
          <span className="text-muted-foreground">{t('home.apiStatus')}</span>
          <span
            data-testid="api-status"
            data-status={vm.apiStatus}
            className="flex items-center gap-2"
          >
            <span
              className={
                vm.apiStatus === 'ok'
                  ? 'size-2 rounded-full bg-primary'
                  : vm.apiStatus === 'error'
                    ? 'size-2 rounded-full bg-destructive'
                    : 'size-2 animate-pulse rounded-full bg-muted-foreground'
              }
              aria-hidden
            />
            {t(`home.status.${vm.apiStatus}`)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

/** The cooking in progress: its dishes, the next timer, and a way back in. */
function Cooking({ cooking }: { cooking: NonNullable<Vm['cooking']> }) {
  const { t } = useTranslation();
  return (
    <section
      aria-labelledby="home-cooking"
      className="grid gap-3 rounded-lg border border-primary bg-card p-4"
    >
      <h2 id="home-cooking" className="flex items-center gap-2 text-lg font-semibold">
        <ChefHat className="size-5" aria-hidden /> {t('home.cooking.title')}
      </h2>
      <ul className="grid gap-1.5">
        {cooking.recipes.map((recipe) => (
          <li key={recipe.id} className="flex min-w-0 items-center gap-2">
            <ColorDot color={recipe.color} className="size-3" />
            <span className="min-w-0 flex-1 truncate font-medium">
              {recipe.title ?? t('common.loading')}
            </span>
            <span className="shrink-0 text-sm text-muted-foreground">
              {t('home.cooking.step', { n: recipe.step })}
            </span>
          </li>
        ))}
      </ul>
      {cooking.next && (
        <p className="flex items-center gap-2 text-sm">
          <Timer className="size-4 shrink-0" aria-hidden />
          {t('home.cooking.next', {
            label: cooking.next.label,
            recipe: cooking.next.recipeTitle,
            time: cooking.next.time,
          })}
        </p>
      )}
      {cooking.finished > 0 && (
        <p className="flex items-center gap-2 text-sm font-medium">
          <BellRing className="size-4 shrink-0" aria-hidden />
          {t('home.cooking.finished', { count: cooking.finished })}
        </p>
      )}
      <Button asChild size="lg" className="justify-self-start">
        <Link to="/cook">{t('home.cooking.resume')}</Link>
      </Button>
    </section>
  );
}

/** A reminder of the shopping list while something is left to buy. */
function Shopping({ count }: { count: number }) {
  const { t } = useTranslation();
  return (
    <Link
      to="/shopping"
      className="flex min-h-11 items-center gap-3 rounded-lg border bg-card p-4 hover:bg-accent"
    >
      <ShoppingCart className="size-5 shrink-0" aria-hidden />
      <span className="flex-1 font-medium">{t('home.shopping', { count })}</span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}

/** A recipe to cook today: the same all day, another one on demand. */
function Idea({ vm }: { vm: Vm }) {
  const { t } = useTranslation();
  const recipe = vm.idea;
  return (
    <section aria-labelledby="home-idea" className="grid gap-3">
      <h2 id="home-idea" className="flex items-center gap-2 text-lg font-semibold">
        <Lightbulb className="size-5" aria-hidden /> {t('home.idea.title')}
      </h2>
      {vm.ideaLoading ? (
        <p className="text-muted-foreground">{t('common.loading')}</p>
      ) : !recipe ? (
        <p className="text-muted-foreground">{t('home.idea.none')}</p>
      ) : (
        <div
          className="grid overflow-hidden rounded-lg border sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"
          aria-busy={vm.ideaChanging}
          data-testid="home-idea"
        >
          {recipe.cover && (
            <img
              src={recipe.cover}
              alt=""
              className="aspect-video w-full bg-muted object-cover sm:aspect-auto sm:h-full"
            />
          )}
          <div className="grid content-start gap-2 p-4">
            <h3 className="text-xl font-semibold wrap-anywhere">{recipe.title}</h3>
            {recipe.description && (
              <p className="line-clamp-3 text-sm wrap-anywhere text-muted-foreground">
                {recipe.description}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {t('recipes.servingsCount', { count: recipe.servings })} ·{' '}
              {t('recipes.by', { name: recipe.ownerName })}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button asChild>
                <Link to={`/recipes/${recipe.id}`}>{t('home.idea.open')}</Link>
              </Button>
              <Button variant="outline" onClick={vm.anotherIdea} disabled={vm.ideaChanging}>
                <RefreshCw /> {t('home.idea.another')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/** The user's recipes changed last; a way to add one when there is none. */
function Recent({ vm }: { vm: Vm }) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="home-recent" className="grid gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="home-recent" className="text-lg font-semibold">
          {t('home.recent.title')}
        </h2>
        {vm.recent.length > 0 && (
          <Link
            to="/recipes"
            className="text-sm font-medium underline decoration-primary decoration-2 underline-offset-2"
          >
            {t('home.recent.all')}
          </Link>
        )}
      </div>
      {vm.recentLoading ? (
        <p className="text-muted-foreground">{t('common.loading')}</p>
      ) : vm.recent.length === 0 ? (
        <div className="grid gap-3 rounded-lg border border-dashed p-4">
          <p className="text-muted-foreground">{t('home.recent.empty')}</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link to="/recipes/new">
                <Plus /> {t('home.recent.add')}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/gallery">{t('home.browseGallery')}</Link>
            </Button>
          </div>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {vm.recent.map((recipe) => (
            <li key={recipe.id} data-testid="recipe-card">
              <RecipeCard recipe={recipe} showOwner={false} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
