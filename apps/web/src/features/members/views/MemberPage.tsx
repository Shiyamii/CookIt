import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { UserAvatar } from '@/components/UserAvatar';
import { Button } from '@/components/ui/button';
import { RecipeCard } from '@/features/recipes/views/RecipeCard';
import { NotFoundPage } from '@/features/system/views/NotFoundPage';
import { useMemberViewModel } from '../viewmodels/useMemberViewModel';

/** A member: name, picture and public recipes. */
export function MemberPage() {
  const { t } = useTranslation();
  const vm = useMemberViewModel();

  if (vm.status === 'loading') {
    return <p className="text-muted-foreground">{t('common.loading')}</p>;
  }
  if (vm.status === 'not_found' || !vm.member) return <NotFoundPage />;
  const member = vm.member;

  return (
    <div className="grid grid-cols-1 gap-6">
      <header className="flex min-w-0 items-center gap-4">
        <UserAvatar image={member.image} name={member.name} className="size-20 text-3xl" />
        <div className="grid min-w-0">
          <h1 className="truncate text-2xl font-semibold">{member.name}</h1>
          <p className="truncate text-muted-foreground">@{member.username}</p>
        </div>
      </header>
      {vm.isMe && (
        <p className="text-sm text-muted-foreground">
          {member.listed ? t('members.youAreListed') : t('members.youAreNotListed')}{' '}
          <Link
            to="/account/profile"
            className="text-foreground underline decoration-primary decoration-2 underline-offset-2"
          >
            {t('members.change')}
          </Link>
        </p>
      )}

      <section className="grid gap-3" aria-labelledby="member-recipes">
        <h2 id="member-recipes" className="text-lg font-semibold">
          {t('members.recipesTitle', { count: member.publicRecipes })}
        </h2>
        {vm.recipesLoading && <p className="text-muted-foreground">{t('common.loading')}</p>}
        {!vm.recipesLoading && vm.recipes.length === 0 && (
          <p className="text-muted-foreground">{t('members.noRecipes')}</p>
        )}
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {vm.recipes.map((recipe) => (
            <li key={recipe.id} data-testid="recipe-card">
              <RecipeCard recipe={recipe} showOwner={false} />
            </li>
          ))}
        </ul>
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
      </section>
    </div>
  );
}
