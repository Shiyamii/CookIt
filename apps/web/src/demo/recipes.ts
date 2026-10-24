import { EXAMPLE_RECIPES, type Locale, type RecipeVisibility } from '@cookit/shared';

// The recipes of the demo, in the markdown format of CookIt (parsed by the recipes service when
// the demo starts, as an import would be). Fictional authors, fictional sources.

export type DemoRecipe = {
  key: string;
  owner: 'admin' | 'member' | 'zsofia' | 'sam';
  lang: Locale;
  visibility: RecipeVisibility;
  tags: string[];
  markdown: string;
  /** Other languages of the same recipe. */
  translations?: Partial<Record<Locale, string>>;
  authorNote?: string;
};

export const DEMO_RECIPES: DemoRecipe[] = [
  {
    key: 'crepes',
    owner: 'member',
    lang: 'fr',
    visibility: 'public',
    tags: ['dessert', 'vegetarien', 'francaise'],
    markdown: EXAMPLE_RECIPES.fr,
    translations: { en: EXAMPLE_RECIPES.en, hu: EXAMPLE_RECIPES.hu },
    authorNote: 'La pâte se garde une nuit au frais : encore meilleure le lendemain.',
  },
  {
    key: 'bourguignon',
    owner: 'member',
    lang: 'fr',
    visibility: 'public',
    tags: ['plat-principal', 'francaise'],
    markdown: `# Bœuf bourguignon

> Le classique du dimanche, encore meilleur réchauffé le lendemain.

résumé: Un bœuf mijoté au vin rouge, à préparer la veille pour la marinade.
portions: 6

---

### Marinade

- 1,5 kg de bœuf à braiser
- 75 cl de vin rouge
- 1 oignon
- 2 carottes
- 1 bouquet garni

### Cuisson

- 200 g de lardons
- 250 g de champignons de Paris
- 2 c. à soupe de farine
- 30 g de beurre
- sel, poivre

---

### La veille

1. Couper le bœuf en gros cubes et le mettre dans un saladier avec le vin, l'oignon et les carottes.
2. Laisser mariner au frais [12 h](timer:12h "marinade").

### Le jour même

1. Faire dorer les lardons [5 min](timer:5m "lardons"), puis la viande égouttée.
2. Saupoudrer de [2 c. à soupe](q:) de farine et cuire [2 min](timer:2m).
3. Mouiller avec la marinade et enfourner à 160 °C pour [3 h](timer:3h "cuisson au four").
4. Faire sauter les champignons dans le beurre [10 min](timer:10m "champignons") et les ajouter avant de servir.
`,
  },
  {
    key: 'lentilles',
    owner: 'member',
    lang: 'fr',
    visibility: 'private',
    tags: ['plat-principal', 'vegetarien'],
    markdown: `# Salade de lentilles tiède

résumé: Lentilles vertes, échalote et vinaigrette à la moutarde, prêtes en 30 minutes.
portions: 4

---

- 300 g de lentilles vertes
- 1 échalote
- 2 carottes
- 1 c. à soupe de moutarde
- 3 c. à soupe d'huile d'olive
- 1 c. à soupe de vinaigre de vin
- persil

---

1. Rincer les lentilles et les cuire dans l'eau froide non salée [25 min](timer:25m "lentilles").
2. Pendant ce temps, couper les carottes en petits dés et ciseler l'échalote.
3. Mélanger la moutarde, le vinaigre et l'huile.
4. Égoutter les lentilles, ajouter les légumes et la vinaigrette encore tiède.
`,
  },
  {
    key: 'yaourt',
    owner: 'member',
    lang: 'fr',
    visibility: 'unlisted',
    tags: ['dessert'],
    markdown: `# Gâteau au yaourt

résumé: Le gâteau des enfants : tout se mesure avec le pot de yaourt.
portions: 8

---

- 1 yaourt nature
- 2 pots de sucre
- 3 pots de farine
- 3 œufs
- ½ pot d'huile
- 1 sachet de levure chimique

---

1. Préchauffer le four à 180 °C.
2. Mélanger le yaourt, le sucre et les œufs, puis la farine, la levure et l'huile.
3. Verser dans un moule beurré et cuire [35 min](timer:35m "gâteau").
4. Laisser refroidir [10 min](timer:10m "refroidir") avant de démouler.
`,
  },
  {
    key: 'oignon',
    owner: 'admin',
    lang: 'fr',
    visibility: 'public',
    tags: ['entree', 'francaise'],
    markdown: `# Soupe à l'oignon gratinée

résumé: Des oignons fondants, un bouillon corsé et des croûtons au comté.
portions: 4

---

- 1 kg d'oignons
- 50 g de beurre
- 1 c. à soupe de farine
- 1,5 l de bouillon de bœuf
- 8 tranches de pain
- 150 g de comté râpé

---

1. Émincer les oignons et les faire fondre dans le beurre à feu doux [30 min](timer:30m "oignons").
2. Saupoudrer de farine, mouiller avec le bouillon et cuire [20 min](timer:20m "bouillon").
3. Verser dans des bols, couvrir de pain et de comté, puis gratiner [5 min](timer:5m "gratin").
`,
  },
  {
    key: 'gulyas',
    owner: 'zsofia',
    lang: 'hu',
    visibility: 'public',
    tags: ['plat-principal', 'hongroise'],
    markdown: `# Gulyásleves

összefoglaló: A klasszikus magyar gulyásleves marhahússal, burgonyával és sok paprikával.
adag: 6

---

- 60 dkg marhalábszár
- 2 fej vöröshagyma
- 2 ek pirospaprika
- 3 db burgonya
- 2 db sárgarépa
- 1 tk őrölt kömény
- só, bors

---

1. Pirítsd meg a felaprított hagymát egy kevés olajon [5 perc](timer:5m "hagyma").
2. Add hozzá a kockára vágott húst, és pirítsd [10 perc](timer:10m "hús").
3. Húzd le a tűzről, szórd meg a pirospaprikával, majd öntsd fel vízzel.
4. Főzd lassú tűzön [1 óra 30 perc](timer:1h30m "főzés"), majd add hozzá a zöldségeket, és főzd további [25 perc](timer:25m "zöldségek").
`,
  },
  {
    key: 'banana',
    owner: 'sam',
    lang: 'en',
    visibility: 'public',
    tags: ['dessert'],
    markdown: `# Banana bread

summary: Moist banana bread with very ripe bananas and a crunchy top.
servings: 10

---

- 3 ripe bananas
- 75 g melted butter
- 150 g sugar
- 1 egg
- 1 tsp baking soda
- 190 g flour
- 1 pinch salt

---

1. Preheat the oven to 175 °C and butter a loaf pan.
2. Mash the bananas, then stir in the butter, sugar and egg.
3. Add the baking soda, salt and flour, and mix just enough.
4. Bake for [55 min](timer:55m "banana bread"), then let it cool [15 min](timer:15m "cooling").
`,
  },
];

/** What the demo member has done with the others' recipes. */
export const DEMO_LINKS = {
  /** Added to the member's recipes by link. */
  saved: ['gulyas'],
  /** Copied into the member's recipes. */
  copied: ['banana'],
  /** The member's private notes. */
  notes: {
    oignon: 'Ajouter un trait de cognac avant le bouillon.',
  } as Record<string, string>,
};
