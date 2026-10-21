import type { Locale } from '../locale';

/**
 * The complete example recipe of the prompts, per language. It uses every construct of the
 * format (description, source, groups, ranges, timers with and without a name, a `q:` quantity).
 * The prompts include its canonical form (`promptExample`), and a test checks that it parses
 * without any diagnostic.
 */
export const EXAMPLE_RECIPES: Record<Locale, string> = {
  fr: `# Crêpes au beurre salé

> Une pâte simple, meilleure après un temps de repos.

portions: 4
source: https://example.com/crepes

---

### Pâte

- 250 g de farine
- 3 œufs
- 50 cl de lait
- 1 pincée de sel

### Garniture

- 60 g de beurre salé
- 2 à 3 c. à soupe de sucre

---

### Pâte

1. Mélanger la farine et le sel, ajouter les œufs puis le lait petit à petit en fouettant.
2. Laisser reposer la pâte [1 h](timer:1h "repos de la pâte").

### Cuisson

1. Faire fondre [20 g](q:) de beurre dans une poêle chaude.
2. Cuire chaque crêpe [1 min 30](timer:1m30s "première face"), puis [1 min](timer:1m) de l'autre côté.
3. Garnir avec le reste du beurre et le sucre.
`,
  en: `# Salted butter crêpes

> A simple batter, better after a rest.

servings: 4
source: https://example.com/crepes

---

### Batter

- 250 g flour
- 3 eggs
- 500 ml milk
- 1 pinch salt

### Topping

- 60 g salted butter
- 2-3 tbsp sugar

---

### Batter

1. Mix the flour and salt, add the eggs, then whisk in the milk little by little.
2. Let the batter rest for [1 h](timer:1h "batter rest").

### Cooking

1. Melt [20 g](q:) of butter in a hot pan.
2. Cook each crêpe [1 min 30 s](timer:1m30s "first side"), then [1 min](timer:1m) on the other side.
3. Top with the rest of the butter and the sugar.
`,
};
