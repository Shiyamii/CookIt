import type { RecipeSummary } from '@cookit/shared';
import { Globe, Link2, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';

const VISIBILITY_ICON = { private: Lock, unlisted: Link2, public: Globe };

/** A recipe in a list: cover thumbnail, title, description, servings, author or visibility. */
export function RecipeCard({ recipe, showOwner }: { recipe: RecipeSummary; showOwner: boolean }) {
  const { t } = useTranslation();
  const Icon = VISIBILITY_ICON[recipe.visibility];
  return (
    <Link
      to={`/recipes/${recipe.id}`}
      className="flex h-full min-w-0 gap-3 rounded-lg border p-4 transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {recipe.cover && (
        <img
          src={recipe.cover}
          alt=""
          loading="lazy"
          className="size-20 shrink-0 rounded-md bg-muted object-cover"
        />
      )}
      <span className="grid min-w-0 flex-1 content-start gap-1">
        <span className="flex min-w-0 items-start gap-2">
          <span className="min-w-0 flex-1 truncate font-medium">{recipe.title}</span>
          {!showOwner && (
            <Icon
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              aria-label={t(`recipes.visibility.${recipe.visibility}`)}
            />
          )}
        </span>
        {(recipe.summary || recipe.description) && (
          <span className="line-clamp-2 text-sm wrap-anywhere text-muted-foreground">
            {recipe.summary || recipe.description}
          </span>
        )}
        {recipe.incomplete && (
          <Badge variant="secondary" className="justify-self-start">
            {t('recipes.incomplete')}
          </Badge>
        )}
        <span className="text-xs text-muted-foreground">
          {t('recipes.servingsCount', { count: recipe.servings })}
          {showOwner && ` · ${t('recipes.by', { name: recipe.ownerName })}`}
        </span>
      </span>
    </Link>
  );
}
