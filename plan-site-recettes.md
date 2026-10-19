# Site de recettes auto-hébergé — plan de développement

Document destiné à Claude Code. Travailler **phase par phase**, un commit par phase, avec les tests indiqués. Demander confirmation avant de s'écarter de ce plan (changement de stack, de modèle de données, de syntaxe markdown).

## 1. Objectif

Application web de recettes, auto-hébergée sur **Coolify**, avec :

- Comptes utilisateurs, **inscription sur invitation uniquement**, gestion rapide des invitations et des utilisateurs par un admin.
- Recettes **privées / non listées (lien secret) / publiques**.
- **Import / export en markdown**, avec une syntaxe spéciale pour les timers et les quantités.
- **Mise à l'échelle des portions**.
- **Mode cuisine** : une étape à la fois, timers en temps réel, écran allumé.
- **Plusieurs recettes cuisinées en parallèle**, avec des timers qui nomment leur plat.
- **Notifications Web Push** quand un timer se termine (même page fermée).
- Très bon sur **mobile** (PWA installable). Interface **français / anglais**.

Hors périmètre pour l'instant : appli native (Capacitor, Android seulement, plus tard si besoin d'une vraie alarme), valeurs nutritionnelles, liste de courses, planning de repas.

## 2. Stack imposée

| Élément          | Choix                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Outillage        | **Bun** pour le gestionnaire de paquets, les workspaces, les scripts, le build et les tests unitaires (`bun test`). **Bun n'est pas le runtime de production** : l'app tourne sous Node.js.                                                                                                                                                                                                                        |
| Front            | **React** + TypeScript, **SPA** (Vite, lancé avec Bun), React Router, TanStack Query pour l'état serveur                                                                                                                                                                                                                                                                                                           |
| Back             | **Hono** sur **Node.js** (LTS, `@hono/node-server`) + TypeScript, validation des entrées avec **Zod** ; pilote Postgres Node (`postgres` ou `pg`) avec Drizzle                                                                                                                                                                                                                                                     |
| UI               | **shadcn/ui** (Radix) + **Tailwind CSS**, icônes `lucide-react`, mobile first                                                                                                                                                                                                                                                                                                                                      |
| Base de données  | **PostgreSQL** (conteneur séparé géré par Coolify)                                                                                                                                                                                                                                                                                                                                                                 |
| ORM / migrations | **Drizzle ORM** + drizzle-kit                                                                                                                                                                                                                                                                                                                                                                                      |
| Auth             | **Better Auth** (adaptateur Drizzle, intégration Hono) avec les plugins `twoFactor` (TOTP + codes de secours) et `passkey` (WebAuthn) ; sessions par cookie (httpOnly, secure, sameSite=lax) ; hash des mots de passe en **argon2id via `@node-rs/argon2`** (binaires précompilés, fonction de hachage personnalisée branchée sur Better Auth ; à défaut, le hash scrypt par défaut de Better Auth est acceptable) |
| Push             | bibliothèque `web-push` + clés VAPID, service worker                                                                                                                                                                                                                                                                                                                                                               |
| PWA              | `vite-plugin-pwa` (Workbox)                                                                                                                                                                                                                                                                                                                                                                                        |
| Markdown         | `unified` / `remark` avec parsing personnalisé (voir §4), **HTML brut interdit**                                                                                                                                                                                                                                                                                                                                   |
| i18n             | `react-i18next` (ou `i18next` + détection de langue), langues `fr` et `en`                                                                                                                                                                                                                                                                                                                                         |
| Tests            | `bun test` pour les tests unitaires (parser, mise à l'échelle, logique pure), Playwright pour le parcours critique de bout en bout, **lancé contre l'image construite qui tourne sous Node** (c'est ce test qui garantit que ce qui est déployé fonctionne, puisque les tests unitaires tournent sous Bun et la prod sous Node)                                                                                    |
| Qualité du code  | **Prettier** (formatage), **ESLint** (config « flat », règles TypeScript et React), **Husky** : hook pre-commit qui lance Prettier, ESLint et les tests unitaires (`bun test`) ; un commit est refusé si l'un d'eux échoue                                                                                                                                                                                         |
| Conteneur        | **Une seule image** Dockerfile multi-stage : étapes d'installation et de build avec `oven/bun`, **image finale `node:<LTS>-slim`** (Debian, glibc, pas Alpine, pour les binaires précompilés) ne contenant que le build et les dépendances de production : Hono sert l'API (`/api/*`) **et** les fichiers statiques de la SPA                                                                                      |

Pas de SQLite, pas de stockage de l'état dans des fichiers : tout l'état est dans Postgres, pour qu'une sauvegarde de la base (par exemple le backup de Coolify) suffise sans script maison.

### Architecture du dépôt

Monorepo **Bun workspaces simple, sans Turborepo** (on pourra l'ajouter plus tard si le nombre de packages ou le temps de build le justifie) :

```
/apps/web      → front React (Vite)
/apps/server   → API Hono + scheduler de notifications + migrations
/packages/shared → types, schémas Zod, et le **parser markdown / mise à l'échelle**
```

- Le parser et les schémas Zod vivent dans `packages/shared` et sont utilisés **à la fois** par le front (aperçu, mode cuisine, mise à l'échelle) et par le back (import, validation).
- Même origine pour le front et l'API (Hono sert tout) : **pas de CORS**, cookies de session simples.
- API REST JSON sous `/api`, versionnée (`/api/v1`), pensée pour être réutilisée plus tard par une appli Capacitor.
- Contrepartie assumée : une SPA n'a pas de rendu serveur, donc les pages de la galerie publique ne sont pas optimisées pour le référencement. Acceptable pour un usage perso/famille ; on pourra ajouter un rendu simplifié des recettes publiques côté Hono si besoin.

## 3. Modèle de données (Postgres)

- **Tables d'authentification gérées par Better Auth** (`user`, `session`, `account`, `verification`, plus `twoFactor` et `passkey` via les plugins) : leur schéma est généré par la CLI Better Auth puis intégré aux migrations Drizzle (`drizzle-kit generate` + `migrate`, pas la commande `migrate` de Better Auth). Ajouter aux champs utilisateur : `username` (unique), `role` (`admin` | `user`), `locale` (`fr` | `en`), `disabled_at`.
- `invites` : id, token_hash, created_by, label (optionnel), expires_at, used_by, used_at, revoked_at.
- `recipes` : id, owner_id, slug (unique par propriétaire), base_lang (`fr` | `en`), servings, visibility (`private` | `unlisted` | `public`), share_token (pour `unlisted`), source_url, cover_image (optionnel), created_at, updated_at.
- `recipe_translations` : recipe_id, lang (`fr` | `en`), title, description, extra_meta (jsonb, clés inconnues de la partie 1, conservées pour ne rien perdre), body_markdown (**parties 2 et 3 uniquement** : ingrédients et étapes, en texte markdown), updated_at ; clé primaire (recipe_id, lang). Chaque recette a au moins la traduction de sa `base_lang`.
  - **Partie 1 = vraies colonnes** (`title`, `description` ici ; `servings` et `source_url` dans `recipes`), qui sont la **source de vérité** : pas de copie dérivée à garder synchronisée. Parties 2 et 3 = `body_markdown`, source de vérité de leur côté.
  - Le document markdown complet (format du §4) n'existe qu'**à l'export, dans l'éditeur markdown et dans les prompts IA** : il est composé à la volée (partie 1 sérialisée depuis les colonnes + `body_markdown`), et découpé/parsé à l'import et à la sauvegarde depuis l'éditeur markdown.
  - Visibilité et image vivent dans `recipes`. Les portions d'une traduction doivent égaler celles de la langue de base (avertissement sinon).
- **Catégories et tags** (liste commune gérée par l'admin, voir §4) :
  - `tag_categories` : id, slug (unique, ex. `type-de-plat`), position, multiple (booléen : plusieurs tags de cette catégorie permis sur une même recette), **labels (jsonb)** : traductions du libellé, ex. `{"fr": "Type de plat", "en": "Dish type"}`.
  - `tags` : id, category_id, slug (**unique globalement**, ex. `vegetarien`), position, **labels (jsonb)** : ex. `{"fr": "Végétarien", "en": "Vegetarian"}`.
  - **Pas de tables de traductions séparées** : les libellés sont un objet JSON `{ langue: libellé }` directement sur la catégorie et sur le tag. Validé par un schéma Zod partagé (clés = langues prises en charge, valeurs = texte non vide) ; ajouter une langue ne demande aucune migration de schéma.
  - `recipe_tags` : recipe_id, tag_id ; clé primaire (recipe_id, tag_id). Les tags appartiennent à la **recette**, pas à une traduction.
- `cook_sessions` : id, user_id, state (jsonb), version (entier incrémenté), updated_at, ended_at.
  - `state.items[]` : `{ recipe_id, lang, servings, current_step, checked_ingredients[], color }`.
- `timers` : id, cook_session_id, recipe_id (nullable), label, ends_at (timestamptz, **heure de fin absolue**), status (`running` | `done` | `cancelled`), notified_at.
- `push_subscriptions` : id, user_id, endpoint (unique), p256dh, auth, user_agent, created_at.

Règle clé : **ne jamais stocker un temps restant qui décroît**. Un timer = une heure de fin ; le temps restant se calcule à l'affichage.

## 4. Format markdown des recettes

Une recette est un fichier markdown en **trois parties séparées par une ligne de tirets** : (1) présentation, (2) ingrédients, (3) étapes. Ce format est le **format d'échange** (export, import, éditeur markdown, prompts IA) ; en base, la partie 1 est stockée en colonnes et les parties 2 et 3 en texte (voir §3).

```markdown
# Pâtes carbonara

> La vraie, sans crème. Le secret : mélanger les œufs hors du feu.

portions: 4
tags: plat-principal, italien
source: https://exemple.com/recette
format: 1

---

### Pour les pâtes

- 400 g spaghetti
- 1 pincée de sel

### Pour la sauce

- 150 g lardons
- 4 œufs
- 50 g pecorino

---

### Les pâtes

1. Porter l'eau à ébullition.
2. Cuire les pâtes [10 min](timer:10m 'pâtes').

### La sauce

1. Faire revenir les lardons [5 min](timer:5m 'lardons') avec [2 c. à soupe](q:) d'huile.
2. Hors du feu, mélanger avec les œufs battus et le pecorino.
```

Règles du parser :

- **Séparateurs** : une ligne qui ne contient que des tirets (3 ou plus : `---`, `-------------`…), **avec une ligne vide avant et après**. Il faut exactement deux séparateurs (donc trois parties) ; sinon erreur explicite (« séparateur manquant », « 4 parties trouvées »…). **Les parties 2 et 3 peuvent être vides** (recette créée sans corps, voir §5.2) : le parser les accepte avec un simple avertissement « aucun ingrédient » / « aucune étape » ; seule la partie 1 (titre et portions) est obligatoire. Les séparateurs dans un bloc de code sont ignorés. Le fichier **ne commence jamais par un frontmatter YAML** (qui utilise aussi `---`) : il n'y a pas de frontmatter dans ce format. L'export écrit toujours les lignes vides autour des séparateurs (un séparateur collé à une ligne de texte transformerait cette ligne en titre dans un lecteur markdown standard, car `---` est aussi le soulignement d'un titre).
- **Les parties sont identifiées par leur position, pas par leur titre.** Il n'y a donc aucun mot-clé de langue à reconnaître (« Ingrédients » / « Ingredients »…). Un titre de niveau 2 en début de partie (`## Ingrédients`) est toléré et ignoré.
- **Partie 1 — présentation** : le premier titre `# ...` est le titre de la recette (obligatoire) ; les citations (`> ...`) ou paragraphes qui suivent sont le commentaire/description ; ensuite des lignes `clé: valeur` : `portions` / `servings` (obligatoire, entier), `source`, `format`. `tags` (identifiants neutres séparés par des virgules, **uniquement dans les échanges**, voir « Catégories et tags » ci-dessous). Clés acceptées en français **et** en anglais ; clés inconnues conservées telles quelles (jamais de perte).
- **Partie 2 — ingrédients** : une liste, **éventuellement découpée en groupes** par des titres de niveau 3 (`### Pour la sauce`). Sans titre, c'est un groupe unique sans nom. Les groupes peuvent avoir n'importe quel nom.
- **Partie 3 — étapes** : listes numérotées, **éventuellement découpées en groupes** par des titres de niveau 3 (`### La sauce`), avec les timers dans le texte. La numérotation recommence à 1 dans chaque groupe dans le fichier ; l'app attribue un **numéro d'étape global** selon l'ordre d'apparition (c'est cet index global que garde `current_step`), et affiche le nom du groupe au-dessus de chaque étape en mode cuisine.
- Ligne d'ingrédient : quantité (entier, décimal, fraction `1/2`, caractères `½ ¼`), unité optionnelle, nom. Si la ligne n'est pas parsable, la garder comme texte brut (jamais de perte).
- Timer : `timer:<durée>` avec `10m`, `1h30m`, `45s` ; le titre du lien (entre guillemets) est le nom du timer, sinon la valeur par défaut est le texte du lien.
- `[texte](q:)` : quantité inline qui suit la mise à l'échelle ; la valeur est lue dans le texte du lien.
- Le texte des étapes, hors quantités marquées, n'est jamais modifié par la mise à l'échelle. Les **durées de timer ne sont jamais mises à l'échelle**.
- Aucun HTML brut accepté (sanitisation à l'import et au rendu).

Mise à l'échelle : `facteur = portions_voulues / portions_recette`, arrondi lisible (pas de `0.333333 g`), fractions courantes affichées proprement (½, ¼, ⅓). Unités non numériques (« une pincée ») inchangées.

**Version du format** : la partie 1 peut contenir la ligne `format: 1`. Le parser lit les anciennes versions et la version courante, pour que les prompts IA et les fichiers exportés restent compatibles dans le temps.

### Catégories et tags

Les tags ne sont pas du texte libre : ce sont des **valeurs d'une liste commune**, rangées en **catégories** (groupes), avec des libellés traduits stockés en JSON (`labels`) sur la catégorie et sur le tag. Une recette ne référence que des identifiants neutres (`recipe_tags`), donc les tags sont les mêmes quelle que soit la langue de la traduction affichée, et ne font pas partie de la « cohérence entre traductions ».

- **Catégories de départ** (créées par un script de départ, modifiables ensuite par l'admin), par exemple : _Type de plat_ (entrée, plat principal, accompagnement, dessert, boisson, sauce, petit-déjeuner, apéritif), _Régime_ (végétarien, végétalien, sans gluten, sans lactose), _Cuisine_ (française, italienne, asiatique, etc.). Libellés fournis en français et en anglais dans le champ `labels`.
- **Gestion par l'admin** : page « Catégories et tags » (créer, renommer, traduire, réordonner, déplacer un tag d'une catégorie à une autre, supprimer). Supprimer un tag utilisé par des recettes demande confirmation, avec le nombre de recettes touchées, ou propose de le **fusionner** dans un autre tag. Les utilisateurs ne créent pas de tags.
- **Choix d'un tag** : dans l'éditeur visuel, un sélecteur par catégorie (choix unique ou multiple selon `multiple`). Libellé lu dans `labels` selon la langue de l'interface, avec repli sur la langue de base puis sur l'identifiant. La comparaison par libellé de la validation à l'import parcourt toutes les valeurs de `labels`. Filtres de la galerie et de la recherche par catégorie puis par tag.
- **Tags absents du markdown éditable** : l'éditeur markdown (et donc le texte envoyé dans le prompt de traduction) **ne contient pas la ligne `tags:`** ; les tags ne se modifient que par l'interface. À la sauvegarde depuis l'éditeur markdown, les tags de la recette ne changent pas.
- **La ligne `tags:` n'existe que dans les échanges** : l'export (fichier, zip) l'écrit avec les identifiants neutres, et l'import la lit.
- **Validation des tags à chaque import** (fichier, zip, markdown collé, réponse d'une IA, URL) : après le découpage du document, l'app ajoute à l'aperçu une étape **« Valider les tags »**. Chaque valeur trouvée dans la ligne `tags:` (ou, pour l'import par URL, dans les mots-clés/catégories de la page) est comparée à la liste : d'abord par identifiant, puis par libellé dans n'importe quelle langue, sans tenir compte de la casse ni des accents. Les tags **reconnus** sont proposés cochés, regroupés par catégorie, que l'utilisateur peut décocher ou compléter à la main ; les valeurs **non reconnues** sont affichées comme ignorées, sans bloquer l'import ; un libellé qui correspond à plusieurs tags demande de choisir. Rien n'est appliqué sans cette validation. Les tags ne sont jamais créés par un import.
- Le **prompt d'import IA** inclut la liste des identifiants de tags disponibles (lue en base) et demande de n'en choisir que dans cette liste, sans en inventer ; la validation ci-dessus reste obligatoire. Une traduction ajoutée via le prompt de traduction ignore toute ligne `tags:`.
- « Ajouter à ma bibliothèque » copie aussi les tags.

### Cohérence entre traductions

Une recette peut avoir un fichier markdown par langue. Pour que l'état d'une session de cuisine reste valide quand on change de langue en cours de route, les traductions doivent avoir **la même structure** : même nombre de groupes d'ingrédients et d'étapes (noms de groupes traduits, mais même ordre), même nombre d'ingrédients par groupe, même nombre d'étapes par groupe, mêmes durées de timer (le nombre et la durée de chaque `timer:` identiques, seuls les noms sont traduits). Le serveur vérifie cette cohérence à l'enregistrement d'une traduction et affiche des **avertissements clairs** (ex. « 6 étapes en français, 5 en anglais ») ; l'utilisateur peut enregistrer malgré l'avertissement, mais le changement de langue en mode cuisine n'est alors proposé que si la structure est identique.

## 5. Fonctionnalités détaillées

### 5.1 Comptes et invitations

- **Premier démarrage** : création de l'admin via variable d'environnement `ADMIN_EMAIL` + lien de configuration à usage unique écrit dans les logs, ou commande CLI documentée. Pas de compte par défaut.
- Page admin **Invitations** : bouton « Créer une invitation » (un clic → lien copiable, expiration configurable, 7 jours par défaut), liste avec statut (en attente / utilisée / expirée / révoquée), révocation en un clic.
- Page admin **Utilisateurs** : liste, désactiver / réactiver, supprimer (avec choix du sort de ses recettes), générer un lien de réinitialisation de mot de passe.
- Page admin **Catégories et tags** : voir §4.
- L'inscription n'est possible qu'avec un lien d'invitation valide. Tokens stockés hashés. L'inscription libre de Better Auth est **désactivée** ; la création de compte passe par une route d'inscription maison qui vérifie et consomme l'invitation (de façon atomique) avant d'appeler Better Auth.
- Limitation de débit sur login, inscription et réinitialisation.

### 5.1 bis Authentification renforcée (optionnelle pour chaque utilisateur)

- **Double authentification (2FA) par application** (TOTP : Google Authenticator, Aegis, 2FAS, etc.) : activation dans les paramètres du compte avec QR code, vérification d'un premier code avant activation, **codes de secours** à usage unique affichés une seule fois, désactivation possible (en redemandant une preuve d'identité).
- **Passkeys (WebAuthn)** : l'utilisateur peut enregistrer une ou plusieurs clés (téléphone, gestionnaire de mots de passe, clé physique), les nommer et les supprimer. Connexion sans saisie du mot de passe (y compris suggestion automatique dans le champ de login). Un compte garde toujours au moins une méthode de connexion valide.
- Le `rpID` WebAuthn correspond au domaine public du site ; documenter qu'un changement de domaine invalide les passkeys existantes.
- Option admin (phase ultérieure) : imposer le 2FA aux comptes admin.
- Procédure de récupération de compte documentée : codes de secours, sinon réinitialisation par un admin (le lien de réinitialisation désactive 2FA et passkeys après confirmation).

### 5.2 Recettes

- CRUD avec **deux modes d'édition au choix**, basculables en un clic **sans perte** :
  - **Éditeur visuel** (par défaut, surtout sur mobile) : formulaire pour la partie 1 (titre, commentaire, portions, source, sélecteurs de tags par catégorie) ; pour les ingrédients, des groupes (ajout, renommage, suppression, réorganisation par glisser-déposer) contenant des lignes quantité / unité (avec suggestions) / nom ; pour les étapes, des groupes contenant des étapes réordonnables, avec un bouton « Ajouter un timer » (durée + nom, inséré à la position du curseur), les timers affichés comme pastilles modifiables dans le texte, et un bouton pour marquer une quantité qui suit les portions. Pas d'éditeur de texte riche lourd : une interface structurée suffit et est plus robuste.
  - **Éditeur markdown** (CodeMirror 6) avec coloration des séparateurs, des titres de groupe et des timers, et un panneau d'erreurs avec numéros de ligne. Si le texte est invalide, la bascule vers l'éditeur visuel est refusée avec une explication, jusqu'à correction.
  - Les deux éditeurs travaillent sur le **même modèle parsé** (`packages/shared`) et un **sérialiseur canonique** produit le markdown : `parse → serialize → parse` doit être stable (test automatisé sur de nombreux exemples), et tout contenu non compris par le parser est conservé comme « bloc libre » plutôt que perdu.
  - Aperçu rendu (et aperçu du mode cuisine pour une étape), garde-fou contre la perte de modifications non enregistrées, brouillon conservé localement.
- **Composition et découpage du document** : à l'ouverture de l'éditeur markdown et à l'export, le serveur compose le document complet (partie 1 depuis les colonnes + `body_markdown`) ; la ligne `tags:` n'y figure que pour l'export, jamais dans l'éditeur markdown. À l'enregistrement depuis l'éditeur markdown, à l'import (fichier, zip, collage d'une réponse d'IA), le serveur découpe le document, parse la partie 1 pour mettre à jour les colonnes (`title`, `description`, `servings`, `source_url`, `extra_meta`) et enregistre le corps, **dans une seule transaction**. L'éditeur visuel modifie directement les colonnes (partie 1) et le corps, sans passer par un document complet. La ligne `format` n'est pas stockée : elle est écrite à l'export avec la version courante du format.
- Visibilités : `private`, `unlisted` (URL avec `share_token`), `public` (visible dans une galerie publique sans compte).
- Bouton **« Ajouter à ma bibliothèque »** sur une recette publique ou partagée (copie indépendante).
- Recherche (titre, description, ingrédients) et filtres par catégorie / tag via index Postgres (`tsvector`, config française et anglaise).
- **Export** : un fichier `.md` par recette ; bouton « Exporter toutes mes recettes » (zip de `.md`).
- **Page « Ajouter une recette »** : un seul point d'entrée, avec des modes de création au choix, du plus rapide au plus complet. Tous aboutissent au même modèle, modifiable ensuite dans les deux éditeurs.
  1. **Création rapide, sans corps** : un petit formulaire (titre, portions, commentaire facultatif, source facultative) qui crée tout de suite la recette avec des parties 2 et 3 **vides**, puis ouvre l'éditeur visuel pour la compléter plus tard. Idéal pour noter l'idée d'une recette. Une recette sans étapes est marquée « à compléter » dans les listes et **ne peut pas être lancée en mode cuisine** (bouton désactivé avec explication).
  2. **Création interactive (assistant pas à pas)**, pensée pour le mobile, en écrans successifs : (a) informations (titre, portions, commentaire, source) ; (b) ingrédients : on peut **coller une liste en vrac** (une ligne par ingrédient) qui est découpée en lignes quantité / unité / nom, corrigeable ligne par ligne, avec groupes optionnels ; (c) étapes : on peut **coller le texte des étapes**, découpé en étapes, avec **détection automatique des durées** (« 10 min », « 1 h 30 ») proposées comme timers que l'utilisateur accepte ou refuse en un tap ; (d) aperçu et enregistrement. On peut sauter une étape de l'assistant (elle reste vide) et terminer à tout moment. Le brouillon est conservé localement si on quitte.
  3. **Import markdown direct** : coller du markdown dans une zone de texte ou déposer un fichier `.md` / un zip, avec **aperçu et erreurs en direct** avant l'enregistrement (même mécanique que pour la réponse d'une IA).
  4. **Import par IA externe** (prompt à copier, voir ci-dessous) et 5. **import par URL** (JSON-LD `schema.org/Recipe`, converti en recette ; les champs absents restent vides plutôt qu'inventés).
  - La détection de durées et le découpage de listes collées vivent dans `packages/shared`, sont **déterministes (sans IA)** et testés (formats FR et EN : « 10 min », « 1h30 », « 45 secondes », « 2 à 3 minutes » → proposer la valeur haute ou demander).
  - Quel que soit le mode d'import, l'aperçu comprend l'étape **« Valider les tags »** (voir §4). Une recette n'est enregistrée qu'après aperçu (sauf la création rapide, qui est immédiate) ; rien n'est publié par défaut (visibilité `private`).
- **Import assisté par IA externe (sans IA intégrée)** : page « Importer avec une IA » proposant un **prompt prêt à copier**. L'utilisateur le colle dans l'assistant IA de son choix (ChatGPT, Claude, Gemini, un modèle local…) avec le texte de la recette (copié d'un site, d'un PDF, ou une photo si l'IA le permet), puis **colle la réponse** dans l'app. L'app la parse en direct, affiche un **aperçu** et la liste des erreurs/avertissements avant l'enregistrement.
  - Le prompt est **généré par le code** à partir de la spécification du format (dans `packages/shared`), jamais écrit à la main dans l'interface, pour qu'il ne se désynchronise pas du parser. Il est disponible en français et en anglais (selon la langue de l'interface).
  - Contenu du prompt : le rôle, la syntaxe exacte du format (trois parties séparées par `---`, groupes de niveau 3, `timer:` et `q:`), un **exemple complet**, et des consignes strictes : ne rien inventer, laisser de côté ou signaler ce qui manque plutôt que deviner une quantité, conserver les durées, détecter les temps de cuisson pour créer les timers, répondre **uniquement avec un bloc de code markdown**.
  - Bouton « Copier le prompt », avec un champ optionnel pour choisir la langue de sortie.
  - L'aperçu est essentiel : une IA peut se tromper sur une quantité, donc l'utilisateur relit avant de sauvegarder (affichage des ingrédients et étapes parsés, timers détectés surlignés).
  - Droits d'auteur : le champ `source` est encouragé, et un rappel indique qu'une recette copiée d'un site tiers ne devrait pas être publiée telle quelle en `public` sans la reformuler.
- **Sécurité de l'import par URL** : protection SSRF obligatoire (refuser localhost et plages privées RFC1918, IPv6 locales, redirections vers ces plages ; vérifier après résolution DNS), timeout, taille maximale. L'instance peut être hébergée sur un réseau privé : l'import ne doit jamais permettre d'atteindre des services internes.

### 5.3 Mode cuisine (cœur du produit)

- Écran **une étape à la fois**, grands caractères, boutons précédent / suivant larges (usage avec les mains sales), ingrédients de la recette accessibles dans un tiroir avec cases à cocher.
- Sélecteur de portions avant de lancer, appliqué à toute la session de cette recette.
- **Wake Lock API** : écran allumé ; réacquérir le verrou au retour de la page au premier plan.
- Les temps détectés dans une étape (`timer:`) sont des boutons : un tap lance le timer.
- Timers : compte à rebours calculé depuis `ends_at` avec un **décalage d'horloge serveur/client corrigé** ; son + vibration au premier plan quand ça se termine ; possibilité de +1 min, pause non requise (annuler / relancer suffit).
- **Session multi-recettes** :
  - On ajoute plusieurs recettes à une session.
  - Une carte (ou onglet) par recette, avec sa couleur, son étape courante et ses timers actifs ; on bascule d'une recette à l'autre sans perdre l'état.
  - **Barre de timers commune**, triée par heure de fin, chaque timer portant le nom du plat (couleur de la recette).
  - Un seul écran principal, pas de navigation compliquée.
- **Sauvegarde de l'état côté serveur à chaque événement** (changement d'étape, ajout/retrait de recette, ingrédient coché, lancement/annulation de timer), **pas** en continu. Copie locale (localStorage / IndexedDB) pour la réactivité et la tolérance aux coupures réseau, avec resynchronisation au retour du réseau. Conflit : le dernier changement gagne (champ `version`).
- Reprise de la session sur un autre appareil (rechargement de l'état au chargement et au retour au premier plan ; temps réel inter-appareils par SSE optionnel, à ne faire qu'en dernier).
- **Idée bonus (phase finale, optionnelle)** : planification à rebours (« je mange à 19h30 → voici quand lancer chaque recette »).

### 5.4 Notifications Web Push

- Service worker, abonnement via `PushManager`, clés VAPID en variables d'environnement.
- À la création d'un timer, le **serveur** programme l'envoi ; il n'y a jamais de `setTimeout` navigateur comme mécanisme de notification.
- Scheduler serveur : boucle toutes les ~5 s qui sélectionne `status='running' AND ends_at <= now() AND notified_at IS NULL` avec `FOR UPDATE SKIP LOCKED`, envoie le push à tous les abonnements de l'utilisateur, marque `notified_at` et `status='done'`. Reprise correcte après redémarrage du conteneur (les timers en attente sont retrouvés en base).
- Supprimer les abonnements qui répondent 404/410.
- Notification : titre = nom du plat, corps = nom du timer ; un tap ouvre le mode cuisine sur la bonne recette.
- iOS : fonctionne seulement si le site est installé sur l'écran d'accueil (iOS 16.4+). Prévoir une page d'aide qui l'explique et un état clair « notifications non activées ».
- Limite assumée : son système par défaut, pas d'alarme répétée (cela viendrait avec Capacitor Android, plus tard).

### 5.5 PWA et mobile

- `manifest.webmanifest`, icônes, installable, thème clair/sombre.
- Conception **mobile first**, cibles tactiles larges, utilisable à une main.
- Cache hors-ligne des pages et des recettes déjà ouvertes (le mode cuisine doit rester utilisable si le réseau coupe en cuisine).

### 5.6 i18n

- Interface fr / en, détection de la langue du navigateur, préférence enregistrée dans le profil.
- Les unités et mots-clés du parser sont reconnus dans les deux langues.
- **Traductions des recettes** : le contenu d'une recette n'est jamais traduit automatiquement. Une recette a une traduction par langue (`recipe_translations`), la langue de base étant celle de création. Sur la page d'une recette, un sélecteur de langue affiche les traductions existantes (repli sur la langue de base si celle de l'utilisateur n'existe pas) ; une action « Ajouter une traduction » ouvre un écran avec :
  - un **prompt de traduction prêt à copier**, qui contient la recette existante en markdown et la langue cible, avec les consignes (conserver à l'identique la structure, le nombre d'étapes et d'ingrédients, les durées et la syntaxe `timer:` / `q:` ; traduire le texte, les titres de section et les noms de timers ; ne pas convertir les unités ; répondre uniquement avec un bloc de code markdown) ;
  - une zone pour **coller le résultat**, parsé en direct avec aperçu et avertissements de cohérence (voir §4).
  - Le prompt est généré par le code (même mécanique que le prompt d'import).
  - En mode cuisine, chaque recette de la session garde sa langue (`state.items[].lang`) ; on peut la changer à la volée si les structures sont identiques.

## 6. Déploiement sur Coolify

- Application **Dockerfile** déployée depuis le dépôt Git ; ressource **PostgreSQL** Coolify séparée dans le même projet.
- Variables d'environnement : `DATABASE_URL`, `ORIGIN` (URL publique en https), `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `ADMIN_EMAIL`, `BETTER_AUTH_SECRET`, `WEBAUTHN_RP_ID` (domaine public, sans schéma), `WEBAUTHN_RP_NAME`. Documenter la génération des clés VAPID (`npx web-push generate-vapid-keys`).
- Derrière Traefik (HTTPS géré par Coolify) : faire confiance aux en-têtes `X-Forwarded-*` uniquement venant du proxy, et vérifier que `ORIGIN` correspond au domaine public (utilisé pour la protection CSRF et les cookies `secure`).
- Le build produit une image unique : build du front (Vite) copié dans l'image du serveur, Hono sert `/api/*` puis les fichiers statiques, avec fallback sur `index.html` pour les routes de la SPA.
- Migrations Drizzle appliquées automatiquement au démarrage avant d'écouter.
- Endpoint `/healthz` (vérifie l'accès à la base) pour le healthcheck Coolify.
- Conteneur exécuté en utilisateur non root, aucun volume applicatif nécessaire (tout est en base ; images de couverture éventuelles stockées en base ou sur un volume documenté).
- **Sauvegardes** : sauvegarde de la base Postgres, par exemple le backup de Coolify. Rien à coder côté appli, mais le README doit expliquer la procédure de restauration. S'y ajoute l'export zip de `.md` par utilisateur.
- Fournir un `docker-compose.dev.yml` (app + Postgres) pour le développement local.

## 7. Sécurité (récapitulatif)

- argon2id, cookies httpOnly/secure/sameSite, protection CSRF (middleware `csrf` de Hono, vérification d'`Origin` sur toutes les requêtes qui modifient l'état), rate limiting sur l'auth (`hono-rate-limiter` ou équivalent, stockage en base).
- Tokens d'invitation, de partage et de réinitialisation : aléatoires (≥ 128 bits), invitations et resets stockés hashés, expiration.
- Autorisations vérifiées côté serveur sur chaque route (propriétaire d'une recette, admin).
- Markdown : pas de HTML brut, sortie sanitisée ; liens `javascript:` interdits.
- Import par URL : protection SSRF (voir §5.2).
- En-têtes de sécurité (CSP stricte compatible avec le service worker, X-Content-Type-Options, Referrer-Policy).
- Aucune donnée sensible dans les logs.

## 8. Phases

Chaque phase se termine par des tests verts, un commit propre et un court README à jour.

1. **Socle** : monorepo (`apps/web`, `apps/server`, `packages/shared`), TypeScript partout, Hono + Drizzle + Postgres, SPA React + Vite, `docker-compose.dev.yml`, Dockerfile image unique, `/healthz`, i18n fr/en en place, layout mobile first, Prettier + ESLint configurés à la racine, hook pre-commit Husky (Prettier, ESLint, tests unitaires) installé par `bun install`.
   _Critère : `docker compose up` donne une app qui répond (API + SPA), migrations appliquées ; un commit avec une erreur de formatage, de lint ou un test unitaire en échec est refusé._
2. **Parser markdown + mise à l'échelle** (module pur, sans UI) : trois parties et séparateurs, métadonnées de la partie 1, groupes d'ingrédients, groupes d'étapes, timers `timer:`, quantités `q:`, fractions, arrondis, bilingue, **sérialiseur canonique** et tests de stabilité `parse → serialize → parse`.
   _Critère : tests unitaires nombreux (cas limites : fractions, unités absentes, lignes non parsables, durées composées)._
3. **Comptes et invitations** : intégration Better Auth (Drizzle + Hono), bootstrap admin, login/logout, sessions, invitations, pages admin utilisateurs/invitations, rate limiting.
   _Critère : impossible de s'inscrire sans invitation valide ; une invitation utilisée ou révoquée ne marche plus._
   3 bis. **2FA et passkeys** : plugins `twoFactor` et `passkey`, pages de paramètres de sécurité (activation TOTP + codes de secours, gestion des passkeys), flux de connexion adapté, procédure de récupération.
   _Critère : connexion possible par mot de passe seul, mot de passe + TOTP, ou passkey seule ; un code de secours ne marche qu'une fois ; supprimer la dernière méthode de connexion est refusé._
4. **Recettes** : CRUD, éditeur visuel + éditeur markdown (CodeMirror) basculables sans perte, aperçu, visibilités, partage `unlisted`, galerie publique, « ajouter à ma bibliothèque », recherche.
   _Critère : un utilisateur ne peut jamais lire/modifier la recette privée d'un autre (tests d'autorisation)._
   4 bis. **Catégories et tags** : tables, script de départ (FR/EN), page admin (créer, traduire, réordonner, déplacer, fusionner, supprimer avec confirmation), sélecteurs par catégorie dans l'éditeur visuel, filtres de la galerie et de la recherche.
   _Critère : changer la langue de l'interface change les libellés sans toucher aux données ; supprimer un tag utilisé demande confirmation ; un utilisateur non admin ne peut ni créer ni modifier un tag._
5. **Création et import / export** : page « Ajouter une recette » (création rapide sans corps, assistant interactif avec collage d'ingrédients/étapes et détection de durées, import markdown direct), `.md`, zip, export global, import par URL (JSON-LD) avec protection SSRF.
   _Critère : une recette créée en mode rapide existe avec des parties 2 et 3 vides et se complète ensuite ; round-trip export → import sans perte (tags compris : reconnus, ignorés et ambigus) ; l'import d'URL vers une IP privée est refusé ; « 1h30 » et « 10 min » sont bien détectés en timers ; l'étape « Valider les tags » reconnaît un tag par identifiant et par libellé FR/EN, ignore un inconnu sans bloquer, et rien n'est appliqué sans validation._
   5 bis. **Prompts IA : import et traduction** : générateur de prompts dans `packages/shared` (FR/EN), page « Importer avec une IA », écran « Ajouter une traduction », aperçu en direct avec erreurs et avertissements de cohérence entre traductions, sélecteur de langue sur les recettes.
   _Critère : un exemple de sortie IA correcte est accepté ; une sortie avec une étape ou un timer manquant produit un avertissement lisible ; le prompt généré contient toujours un exemple valide pour la version courante du format (test automatisé qui parse l'exemple inclus dans le prompt)._
6. **Mode cuisine mono-recette** : étapes, portions, ingrédients cochés, Wake Lock, timers calculés sur `ends_at`, état sauvegardé côté serveur par événements, copie locale.
   _Critère : recharger la page ou changer d'appareil retrouve exactement l'étape et les timers._
7. **Multi-recettes** : session avec plusieurs recettes, cartes, barre de timers commune colorée et nommée.
   _Critère : deux recettes avec chacune deux timers restent lisibles et corrects après rechargement._
8. **Web Push** : service worker, abonnement, scheduler serveur, nettoyage des abonnements morts, page d'aide iOS.
   _Critère : un timer lancé puis page fermée envoie bien la notification à l'heure ; un redémarrage du conteneur n'en perd aucun._
9. **PWA et finitions** : manifest, installation, cache hors-ligne, thème, accessibilité, passe mobile complète.
   _Critère : Lighthouse PWA/accessibilité corrects, mode cuisine utilisable hors-ligne sur une recette déjà ouverte._
10. **Déploiement et doc** : README (installation Coolify pas à pas, variables, VAPID, sauvegarde/restauration Postgres), test Playwright du parcours « invitation → créer recette → cuisiner avec timers », revue sécurité du §7.
11. **Optionnel** : SSE pour la synchro temps réel entre appareils, planification à rebours, groupes d'étapes affichés comme **pistes parallèles** (ex. pâtes et sauce menées en même temps dans une même recette), import Cooklang (`.cook`), Capacitor Android pour une vraie alarme, **IA intégrée** (appel d'une API de modèle ou d'un modèle local, configurable par l'admin, qui exécuterait les mêmes prompts que ceux proposés à la copie ; à ne faire qu'après avoir validé l'usage réel des prompts manuels).

## 9. Consignes pour Claude Code

- Commencer par la phase 1 et ne pas anticiper les suivantes.
- Les tags sont des valeurs de liste (voir §4), jamais du texte libre ; ils sont absents de l'éditeur markdown et validés à chaque import.
- Le parser (phase 2) est un module isolé et très testé, dans `packages/shared` : il sert à la fois à l'import (back), à la mise à l'échelle et au mode cuisine (front).
- Le scheduler de notifications vit dans `apps/server`, démarré avec le serveur Hono ; un seul processus applicatif, pas de worker séparé.
- Toute entrée de l'API est validée avec un schéma Zod partagé ; ne jamais faire confiance aux types côté client.
- Toute la logique de temps repose sur des **heures absolues** en base ; interdire les compteurs qui décroissent côté stockage.
- Les décisions non prévues ici (choix d'une bibliothèque, compromis de design) sont notées dans un fichier `DECISIONS.md` avec une ligne de justification.
- Demander avant tout ajout de dépendance lourde ou de service supplémentaire : le but est un déploiement simple (une image + Postgres).
- **Bun = outillage uniquement, Node = runtime de production.** Ne jamais utiliser d'API spécifiques à Bun (`Bun.*`) dans le code applicatif (`apps/server`, `apps/web`, `packages/shared`) : tout le code doit tourner sous Node. Les API `Bun.*` ne sont tolérées que dans des scripts d'outillage qui ne sont pas livrés dans l'image.
- Le même code doit passer les tests sous Bun (`bun test`) **et** tourner sous Node en production. Garder les tests unitaires sur de la logique pure (sans dépendance au runtime) ; ce qui touche au serveur, à la base ou aux notifications est couvert par les tests de bout en bout contre l'image réelle.
- `bun install` génère `bun.lock` (lockfile unique, à committer) ; le Dockerfile installe avec `bun install --frozen-lockfile` à l'étape de build.
- Vérifier dès la phase 1 que `drizzle-kit generate/migrate`, `vite build` et le lancement de `tsx`/Node sur le build du serveur fonctionnent depuis un workspace Bun. Noter les contournements dans `DECISIONS.md`.
