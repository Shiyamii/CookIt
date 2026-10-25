import { EXAMPLE_RECIPES, type Locale, type RecipeVisibility } from '@cookit/shared';

// The recipes of the demo, in the markdown format of CookIt (parsed by the recipes service when
// the demo starts, as an import would be), each in French, English and Hungarian with the same
// structure (checked by recipes.test.ts). Fictional authors, fictional sources.

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
    translations: {
      en: `# Beef bourguignon

> The Sunday classic, even better reheated the next day.

summary: Beef simmered in red wine, started the day before for the marinade.
servings: 6

---

### Marinade

- 1.5 kg braising beef
- 75 cl red wine
- 1 onion
- 2 carrots
- 1 bouquet garni

### Cooking

- 200 g lardons
- 250 g button mushrooms
- 2 tbsp flour
- 30 g butter
- salt, pepper

---

### The day before

1. Cut the beef into large cubes and put it in a bowl with the wine, the onion and the carrots.
2. Leave to marinate in the fridge for [12 h](timer:12h "marinade").

### On the day

1. Brown the lardons [5 min](timer:5m "lardons"), then the drained meat.
2. Sprinkle with [2 tbsp](q:) of flour and cook for [2 min](timer:2m).
3. Pour in the marinade and bake at 160 °C for [3 h](timer:3h "in the oven").
4. Sauté the mushrooms in the butter [10 min](timer:10m "mushrooms") and add them before serving.
`,
      hu: `# Burgundi marharagu

> A vasárnapi klasszikus, másnap felmelegítve még finomabb.

összefoglaló: Vörösborban lassan párolt marhahús, a pácot előző nap kell elkészíteni.
adag: 6

---

### Pác

- 1,5 kg pörköltnek való marhahús
- 75 cl vörösbor
- 1 fej vöröshagyma
- 2 sárgarépa
- 1 csokor friss fűszernövény

### Főzés

- 20 dkg kockázott füstölt szalonna
- 25 dkg csiperkegomba
- 2 ek liszt
- 3 dkg vaj
- só, bors

---

### Előző nap

1. Vágd nagy kockákra a húst, és tedd egy tálba a borral, a hagymával és a répával.
2. Pácold a hűtőben [12 óra](timer:12h "pác").

### Aznap

1. Pirítsd meg a szalonnát [5 perc](timer:5m "szalonna"), majd a lecsepegtetett húst.
2. Szórd meg [2 ek](q:) liszttel, és pirítsd [2 perc](timer:2m).
3. Öntsd fel a páccal, és tedd 160 °C-os sütőbe [3 óra](timer:3h "sütő").
4. Pirítsd meg a gombát a vajon [10 perc](timer:10m "gomba"), és tálalás előtt keverd a húshoz.
`,
    },
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
    translations: {
      en: `# Warm lentil salad

summary: Green lentils, shallot and a mustard dressing, ready in 30 minutes.
servings: 4

---

- 300 g green lentils
- 1 shallot
- 2 carrots
- 1 tbsp mustard
- 3 tbsp olive oil
- 1 tbsp wine vinegar
- parsley

---

1. Rinse the lentils and cook them in cold unsalted water [25 min](timer:25m "lentils").
2. Meanwhile, dice the carrots and finely chop the shallot.
3. Mix the mustard, the vinegar and the oil.
4. Drain the lentils, then add the vegetables and the dressing while still warm.
`,
      hu: `# Langyos lencsesaláta

összefoglaló: Zöldlencse, salottahagyma és mustáros öntet, 30 perc alatt kész.
adag: 4

---

- 30 dkg zöldlencse
- 1 salottahagyma
- 2 sárgarépa
- 1 ek mustár
- 3 ek olívaolaj
- 1 ek borecet
- petrezselyem

---

1. Öblítsd le a lencsét, és főzd hideg, sótlan vízben [25 perc](timer:25m "lencse").
2. Közben vágd apró kockákra a répát, és aprítsd fel a salottahagymát.
3. Keverd össze a mustárt, az ecetet és az olajat.
4. Szűrd le a lencsét, és még langyosan keverd össze a zöldségekkel és az öntettel.
`,
    },
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
    translations: {
      en: `# Yogurt cake

summary: The children's cake: everything is measured with the yogurt pot.
servings: 8

---

- 1 plain yogurt
- 2 pots sugar
- 3 pots flour
- 3 eggs
- ½ pot oil
- 1 packet baking powder

---

1. Preheat the oven to 180 °C.
2. Mix the yogurt, the sugar and the eggs, then the flour, the baking powder and the oil.
3. Pour into a buttered tin and bake for [35 min](timer:35m "cake").
4. Leave to cool [10 min](timer:10m "cooling") before turning out.
`,
      hu: `# Joghurtos kevert süti

összefoglaló: A gyerekek kedvence: mindent a joghurtos pohárral mérünk.
adag: 8

---

- 1 natúr joghurt
- 2 pohár cukor
- 3 pohár liszt
- 3 tojás
- ½ pohár olaj
- 1 csomag sütőpor

---

1. Melegítsd elő a sütőt 180 °C-ra.
2. Keverd össze a joghurtot, a cukrot és a tojásokat, majd a lisztet, a sütőport és az olajat.
3. Öntsd kivajazott formába, és süsd [35 perc](timer:35m "sütés").
4. Hagyd hűlni [10 perc](timer:10m "hűlés"), mielőtt kiveszed a formából.
`,
    },
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
    translations: {
      en: `# French onion soup

summary: Melting onions, a rich broth and croutons topped with Comté.
servings: 4

---

- 1 kg onions
- 50 g butter
- 1 tbsp flour
- 1.5 l beef stock
- 8 slices bread
- 150 g grated Comté

---

1. Slice the onions and let them melt in the butter over low heat [30 min](timer:30m "onions").
2. Sprinkle with the flour, pour in the stock and simmer [20 min](timer:20m "broth").
3. Pour into bowls, cover with the bread and the Comté, then grill [5 min](timer:5m "gratin").
`,
      hu: `# Francia hagymaleves

összefoglaló: Puhára párolt hagyma, erős húsleves és sajtos pirítós a tetején.
adag: 4

---

- 1 kg vöröshagyma
- 5 dkg vaj
- 1 ek liszt
- 1,5 l marhahúsleves
- 8 szelet kenyér
- 15 dkg reszelt comté sajt

---

1. Szeleteld fel a hagymát, és lassú tűzön párold puhára a vajon [30 perc](timer:30m "hagyma").
2. Szórd meg liszttel, öntsd fel a levessel, és főzd [20 perc](timer:20m "leves").
3. Szedd tálkákba, tedd rá a kenyeret és a sajtot, majd grillezd [5 perc](timer:5m "gratinálás").
`,
    },
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
    translations: {
      fr: `# Soupe goulache

résumé: La soupe hongroise classique au bœuf, aux pommes de terre et au paprika.
portions: 6

---

- 600 g de jarret de bœuf
- 2 oignons
- 2 c. à soupe de paprika doux
- 3 pommes de terre
- 2 carottes
- 1 c. à café de carvi moulu
- sel, poivre

---

1. Faire revenir les oignons hachés dans un peu d'huile [5 min](timer:5m "oignons").
2. Ajouter la viande coupée en cubes et la faire dorer [10 min](timer:10m "viande").
3. Retirer du feu, saupoudrer de paprika, puis mouiller avec de l'eau.
4. Laisser mijoter à feu doux [1 h 30](timer:1h30m "cuisson"), puis ajouter les légumes et cuire encore [25 min](timer:25m "légumes").
`,
      en: `# Goulash soup

summary: The classic Hungarian soup with beef, potatoes and plenty of paprika.
servings: 6

---

- 600 g beef shin
- 2 onions
- 2 tbsp sweet paprika
- 3 potatoes
- 2 carrots
- 1 tsp ground caraway
- salt, pepper

---

1. Fry the chopped onions in a little oil [5 min](timer:5m "onions").
2. Add the diced meat and brown it [10 min](timer:10m "meat").
3. Take off the heat, sprinkle with the paprika, then cover with water.
4. Simmer over low heat [1 h 30](timer:1h30m "simmering"), then add the vegetables and cook for another [25 min](timer:25m "vegetables").
`,
    },
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
    translations: {
      fr: `# Cake à la banane

résumé: Un banana bread moelleux, avec des bananes bien mûres et un dessus croustillant.
portions: 10

---

- 3 bananes bien mûres
- 75 g de beurre fondu
- 150 g de sucre
- 1 œuf
- 1 c. à café de bicarbonate
- 190 g de farine
- 1 pincée de sel

---

1. Préchauffer le four à 175 °C et beurrer un moule à cake.
2. Écraser les bananes, puis incorporer le beurre, le sucre et l'œuf.
3. Ajouter le bicarbonate, le sel et la farine, et mélanger juste assez.
4. Cuire [55 min](timer:55m "cake"), puis laisser refroidir [15 min](timer:15m "refroidir").
`,
      hu: `# Banánkenyér

összefoglaló: Szaftos banánkenyér nagyon érett banánból, ropogós tetővel.
adag: 10

---

- 3 érett banán
- 7,5 dkg olvasztott vaj
- 15 dkg cukor
- 1 tojás
- 1 tk szódabikarbóna
- 19 dkg liszt
- 1 csipet só

---

1. Melegítsd elő a sütőt 175 °C-ra, és vajazz ki egy kenyérformát.
2. Törd össze a banánt, majd keverd hozzá a vajat, a cukrot és a tojást.
3. Add hozzá a szódabikarbónát, a sót és a lisztet, és épp csak keverd össze.
4. Süsd [55 perc](timer:55m "banánkenyér"), majd hagyd hűlni [15 perc](timer:15m "hűlés").
`,
    },
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
