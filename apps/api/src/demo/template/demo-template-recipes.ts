import type { CreateRecipeMetadata, MeasurementUnit } from '@recipe-app/contracts/types';

/** The Demo template's Categories, in their order. Eight of the ten a person may keep, so a visitor can still add two. */
export const DEMO_TEMPLATE_CATEGORIES = ['Breakfast', 'Lunch', 'Dinner', 'Desserts', 'Snacks', 'Vegetarian', 'Quick', 'Baking'] as const;

export type DemoTemplateCategory = (typeof DEMO_TEMPLATE_CATEGORIES)[number];

/** An ingredient row: name, then amount and unit, or null for both ("to taste"). */
type Ingredient = readonly [name: string, quantity: number, unit: MeasurementUnit] | readonly [name: string, quantity: null, unit: null];
/** A step's text, or the one step that carries the recipe's step Photo. */
type Step = string | { readonly description: string; readonly photo: true };
/** A Group: a run of rows under an optional name. */
type Group<Row> = { readonly heading: string | null; readonly rows: readonly Row[] };

export type DemoTemplateRecipe = {
  /** Names the recipe's id and Photo files: `<slug>-cover.webp`, and `<slug>-step.webp` when a step carries a Photo. */
  slug: string;
  title: string;
  description: string;
  servings: number;
  prepTimeMinutes: number;
  cookTimeMinutes: number;
  notes: string | null;
  videoUrl: string | null;
  categories: readonly DemoTemplateCategory[];
  favorite: boolean;
  ingredients: readonly Group<Ingredient>[];
  steps: readonly Group<Step>[];
};

/**
 * The 15 recipes every Demo account starts with, in the order the recipe list shows them (newest first). Picked from the
 * main seed's fixtures and enriched so each recipe feature appears at least once.
 */
export const DEMO_TEMPLATE_RECIPES: readonly DemoTemplateRecipe[] = [
  {
    slug: 'rosemary-roast-chicken', title: 'Rosemary Roast Chicken',
    description: 'Crisp-skinned chicken thighs roasted over rosemary potatoes in one tin.',
    servings: 4, prepTimeMinutes: 15, cookTimeMinutes: 45, categories: ['Dinner'], favorite: true,
    notes: 'Bone-in, skin-on thighs stay juicy and forgiving. If the potatoes need longer than the chicken, move the chicken to a plate under foil and give the potatoes ten more minutes.',
    videoUrl: 'https://www.youtube.com/watch?v=X_QohZUY_-o',
    ingredients: [
      { heading: 'Chicken', rows: [
        ['bone-in chicken thighs', 8, 'piece'], ['olive oil', 1, 'tbsp'], ['salt', 1, 'tsp'], ['black pepper', 0.5, 'tsp'],
      ] },
      { heading: 'Potatoes', rows: [
        ['potatoes, cut into wedges', 750, 'g'], ['olive oil', 2, 'tbsp'], ['fresh rosemary, chopped', 1.5, 'tbsp'], ['garlic', 4, 'clove'], ['lemon', 1, 'piece'],
      ] },
    ],
    steps: [
      { heading: 'Prepare', rows: [
        'Heat the oven to 220 C. Pat the chicken thighs dry and season them all over with the salt and pepper.',
        'Toss the potato wedges in a roasting tin with the olive oil, rosemary, crushed garlic and a pinch of salt.',
      ] },
      { heading: 'Roast', rows: [
        'Nestle the chicken skin side up among the potatoes and drizzle the skin with the remaining oil.',
        'Roast for 40 to 45 minutes, until the skin is crisp and the thickest thigh reaches 74 C.',
        'Squeeze the lemon over the tin, rest for five minutes and serve with the pan juices.',
      ] },
    ],
  },
  {
    slug: 'lemon-ricotta-pancakes', title: 'Lemon Ricotta Pancakes',
    description: 'Fluffy pancakes brightened with lemon and creamy ricotta.',
    servings: 4, prepTimeMinutes: 10, cookTimeMinutes: 15, categories: ['Breakfast', 'Vegetarian'], favorite: true,
    notes: 'Stop mixing while a few lumps remain; overmixed batter makes flat, chewy pancakes. Keep finished batches warm in a 100 C oven.',
    videoUrl: null,
    ingredients: [
      { heading: 'Batter', rows: [
        ['ricotta', 250, 'g'], ['eggs', 3, 'piece'], ['milk', 0.75, 'cup'], ['lemon zest', 1, 'tbsp'], ['lemon juice', 1, 'tbsp'],
        ['flour', 1, 'cup'], ['sugar', 2, 'tbsp'], ['baking powder', 1.5, 'tsp'], ['salt', 1, 'pinch'],
      ] },
      { heading: 'To serve', rows: [['butter', 1, 'tbsp'], ['Greek yogurt', 0.5, 'cup'], ['lemon wedges', null, null]] },
    ],
    steps: [{ heading: null, rows: [
      'Whisk the ricotta, eggs, milk, lemon zest and lemon juice until smooth.',
      'Fold in the flour, sugar, baking powder and salt until just combined.',
      'Melt a little butter in a pan over medium heat and add the batter a quarter cup at a time.',
      'Flip when bubbles appear and the bottoms are golden, about two minutes, then cook two minutes more.',
      'Serve warm with yogurt and lemon wedges.',
    ] }],
  },
  {
    slug: 'sesame-soba-noodles', title: 'Sesame Soba Noodles',
    description: 'Chilled buckwheat noodles with cucumber in a soy sesame dressing.',
    servings: 2, prepTimeMinutes: 10, cookTimeMinutes: 8, categories: ['Lunch', 'Quick', 'Vegetarian'], favorite: true,
    notes: 'Rinsing the noodles washes off their surface starch so they stay separate. Dressed noodles keep in the fridge for a day.',
    videoUrl: null,
    ingredients: [
      { heading: 'Noodles', rows: [
        ['soba noodles', 200, 'g'], ['cucumber', 1, 'piece'], ['spring onions', 2, 'piece'], ['sesame seeds', 1, 'tbsp'],
      ] },
      { heading: 'Dressing', rows: [
        ['soy sauce', 2.5, 'tbsp'], ['toasted sesame oil', 1, 'tbsp'], ['rice vinegar', 1, 'tbsp'], ['honey', 1, 'tsp'], ['fresh ginger, grated', 1, 'tsp'],
      ] },
    ],
    steps: [
      { heading: 'Dressing', rows: ['Whisk the soy sauce, sesame oil, rice vinegar, honey and ginger in a large bowl.'] },
      { heading: 'Noodles', rows: [
        'Boil the soba according to the packet, then drain and rinse under cold water until chilled.',
        'Slice the cucumber into thin matchsticks and the spring onions finely.',
        'Toss the noodles and cucumber in the dressing and scatter the spring onions and sesame seeds on top.',
      ] },
    ],
  },
  {
    slug: 'dark-chocolate-mousse', title: 'Dark Chocolate Mousse',
    description: 'A silky, egg-free chocolate mousse lightened with whipped cream.',
    servings: 4, prepTimeMinutes: 15, cookTimeMinutes: 5, categories: ['Desserts', 'Vegetarian'], favorite: true,
    notes: 'Fold the cream in while the chocolate is just warm: too hot and the cream melts, too cold and the chocolate sets in streaks.',
    videoUrl: 'https://www.youtube.com/watch?v=Nx-6MlgTpNA',
    ingredients: [{ heading: null, rows: [
      ['dark chocolate (70%)', 150, 'g'], ['heavy cream', 1.25, 'cup'], ['sugar', 2, 'tbsp'], ['vanilla extract', 0.5, 'tsp'], ['salt', 1, 'pinch'],
    ] }],
    steps: [{ heading: null, rows: [
      'Melt the chocolate in a bowl over barely simmering water, then cool until just warm.',
      'Whip the cream with the sugar, vanilla and salt to soft peaks.',
      'Stir a quarter of the cream into the chocolate to loosen it, then fold in the rest in two additions.',
      'Spoon into four small cups and chill for at least two hours.',
    ] }],
  },
  {
    slug: 'pesto-mozzarella-panini', title: 'Pesto Mozzarella Panini',
    description: 'Pressed sourdough sandwiches with pesto, tomato and melting mozzarella.',
    servings: 2, prepTimeMinutes: 8, cookTimeMinutes: 8, categories: ['Lunch', 'Quick', 'Vegetarian'], favorite: false,
    notes: 'No sandwich press? Cook the panini in a frying pan under a heavy saucepan and turn them halfway.',
    videoUrl: null,
    ingredients: [{ heading: null, rows: [
      ['sourdough bread', 4, 'slice'], ['basil pesto', 3, 'tbsp'], ['fresh mozzarella', 125, 'g'], ['tomato', 1, 'piece'],
      ['olive oil', 1, 'tbsp'], ['black pepper', null, null],
    ] }],
    steps: [{ heading: null, rows: [
      { description: 'Spread the pesto over the bread, then layer sliced tomato and mozzarella on two of the slices and season with pepper.', photo: true },
      'Close the sandwiches and brush the outsides lightly with olive oil.',
      'Toast in a hot sandwich press for four to five minutes, until the bread is crisp and the cheese melts.',
      'Cut diagonally and serve straight away.',
    ] }],
  },
  {
    slug: 'ginger-salmon-rice', title: 'Ginger Salmon Rice',
    description: 'Baked salmon with a sticky ginger soy glaze over steamed rice.',
    servings: 2, prepTimeMinutes: 10, cookTimeMinutes: 20, categories: ['Dinner', 'Quick'], favorite: false,
    notes: 'Thin fillets cook faster, so start checking them at ten minutes.',
    videoUrl: null,
    ingredients: [
      { heading: 'Glaze', rows: [['soy sauce', 2, 'tbsp'], ['honey', 1, 'tbsp'], ['fresh ginger, grated', 1, 'tbsp'], ['garlic', 1, 'clove']] },
      { heading: 'Salmon and rice', rows: [['salmon fillets', 2, 'piece'], ['jasmine rice', 1, 'cup'], ['water', 1.5, 'cup']] },
    ],
    steps: [{ heading: null, rows: [
      'Rinse the rice, then simmer it covered in the water for 15 minutes and rest it off the heat.',
      { description: 'Mix the ginger, soy sauce, honey and grated garlic, then brush the glaze over the salmon in a baking dish.', photo: true },
      'Bake at 200 C for 12 to 15 minutes, until the salmon flakes easily and reaches 63 C.',
      'Spoon the pan juices over the salmon and serve it on the rice.',
    ] }],
  },
  {
    slug: 'blueberry-yogurt-bowl', title: 'Blueberry Yogurt Bowl',
    description: 'Cool yogurt with blueberries, chia seeds and crunchy oats.',
    servings: 2, prepTimeMinutes: 5, cookTimeMinutes: 0, categories: ['Breakfast', 'Quick', 'Vegetarian'], favorite: false,
    notes: 'For extra crunch, toast the oats in a dry pan for three minutes and let them cool first.',
    videoUrl: null,
    ingredients: [{ heading: null, rows: [
      ['Greek yogurt', 1.5, 'cup'], ['blueberries', 1, 'cup'], ['rolled oats', 0.333, 'cup'], ['chia seeds', 1, 'tbsp'], ['honey', 2, 'tsp'],
    ] }],
    steps: [{ heading: null, rows: [
      'Rinse the blueberries and drain them well.',
      'Divide the yogurt between two bowls and scatter the oats and chia seeds over it.',
      'Top with the blueberries, drizzle with honey and serve straight away.',
    ] }],
  },
  {
    slug: 'tomato-olive-puff-tarts', title: 'Tomato Olive Puff Tarts',
    description: 'Golden puff pastry squares topped with cherry tomatoes, olives and feta.',
    servings: 6, prepTimeMinutes: 15, cookTimeMinutes: 20, categories: ['Snacks', 'Baking', 'Vegetarian'], favorite: false,
    notes: 'Keep the pastry cold until it goes into the oven; cold butter layers puff the highest.',
    videoUrl: null,
    ingredients: [
      { heading: 'Pastry', rows: [['ready-rolled puff pastry', 320, 'g'], ['egg, beaten', 1, 'piece']] },
      { heading: 'Topping', rows: [['cherry tomatoes', 150, 'g'], ['kalamata olives', 50, 'g'], ['feta', 60, 'g'], ['dried oregano', 0.5, 'tsp']] },
    ],
    steps: [{ heading: null, rows: [
      'Heat the oven to 200 C and cut the pastry into 12 squares on a lined baking tray.',
      { description: 'Top with halved tomatoes, sliced olives and crumbled feta, leaving the edges clear.', photo: true },
      'Brush the bare edges with beaten egg and sprinkle the oregano over the topping.',
      'Bake for 18 to 20 minutes, until the pastry is puffed and golden.',
    ] }],
  },
  {
    slug: 'roasted-beet-feta-salad', title: 'Roasted Beet Feta Salad',
    description: 'Sweet roasted beets with peppery arugula, feta and a balsamic dressing.',
    servings: 4, prepTimeMinutes: 10, cookTimeMinutes: 45, categories: ['Lunch', 'Vegetarian'], favorite: false,
    notes: 'Rub the skins off the roasted beets with a paper towel to keep your hands clean. The beets can be roasted up to three days ahead.',
    videoUrl: null,
    ingredients: [
      { heading: 'Salad', rows: [['beetroot', 500, 'g'], ['arugula', 80, 'g'], ['feta', 100, 'g']] },
      { heading: 'Dressing', rows: [['olive oil', 3, 'tbsp'], ['balsamic vinegar', 1, 'tbsp'], ['Dijon mustard', 0.5, 'tsp'], ['salt', 1, 'pinch']] },
    ],
    steps: [{ heading: null, rows: [
      'Heat the oven to 200 C. Wrap the beets in foil and roast for 40 to 45 minutes, until a knife slides in easily.',
      'Cool, peel and slice the beets into rounds.',
      'Whisk the olive oil, balsamic vinegar, mustard and salt.',
      'Toss the arugula with half the dressing, top with the beets and feta, and drizzle the rest over.',
    ] }],
  },
  {
    slug: 'peach-oat-crumble', title: 'Peach Oat Crumble',
    description: 'Juicy baked peaches under a buttery cinnamon oat topping.',
    servings: 6, prepTimeMinutes: 15, cookTimeMinutes: 35, categories: ['Desserts', 'Baking', 'Vegetarian'], favorite: false,
    notes: 'Frozen peaches work too: thaw and drain them before tossing with the sugar.',
    videoUrl: null,
    ingredients: [
      { heading: 'Fruit', rows: [['ripe peaches', 6, 'piece'], ['brown sugar', 2, 'tbsp'], ['lemon juice', 1, 'tbsp'], ['cornstarch', 1, 'tbsp']] },
      { heading: 'Crumble', rows: [
        ['rolled oats', 0.75, 'cup'], ['flour', 0.5, 'cup'], ['brown sugar', 0.333, 'cup'], ['cold butter', 85, 'g'], ['ground cinnamon', 0.5, 'tsp'],
      ] },
    ],
    steps: [{ heading: null, rows: [
      'Heat the oven to 180 C. Slice the peaches and toss them in a baking dish with the sugar, lemon juice and cornstarch.',
      { description: 'Rub the butter into the oats, flour, sugar and cinnamon until crumbly and scatter it over the fruit.', photo: true },
      'Bake for 30 to 35 minutes, until golden on top and bubbling at the edges.',
      'Cool for ten minutes before serving.',
    ] }],
  },
  {
    slug: 'cheddar-chive-scones', title: 'Cheddar Chive Scones',
    description: 'Savory baked scones with sharp cheddar and fresh chives.',
    servings: 8, prepTimeMinutes: 15, cookTimeMinutes: 20, categories: ['Breakfast', 'Baking', 'Vegetarian'], favorite: false,
    notes: 'Keep the butter cold and handle the dough as little as possible for a tall, tender rise.',
    videoUrl: null,
    ingredients: [
      { heading: 'Dough', rows: [
        ['flour', 250, 'g'], ['baking powder', 1, 'tbsp'], ['salt', 0.5, 'tsp'], ['cold butter', 60, 'g'],
        ['sharp cheddar, grated', 100, 'g'], ['chives, chopped', 2, 'tbsp'], ['milk', 0.667, 'cup'],
      ] },
      { heading: 'Glaze', rows: [['egg', 1, 'piece'], ['milk', 1, 'tbsp']] },
    ],
    steps: [{ heading: null, rows: [
      'Heat the oven to 200 C and line a baking tray. Rub the butter into the flour, baking powder and salt until it looks like coarse crumbs.',
      { description: 'Mix in the cheddar and chives, add the milk and gently bring the dough together.', photo: true },
      'Pat the dough out 2 cm thick, cut it into 8 rounds and set them on the tray.',
      'Brush with the egg beaten with the milk, and bake for 18 to 20 minutes, until risen and golden.',
    ] }],
  },
  {
    slug: 'eggplant-tomato-bake', title: 'Eggplant Tomato Bake',
    description: 'Layers of roasted eggplant, tomato sauce and bubbling mozzarella.',
    servings: 4, prepTimeMinutes: 15, cookTimeMinutes: 40, categories: ['Dinner', 'Vegetarian'], favorite: false,
    notes: 'Assemble up to a day ahead and keep it covered in the fridge; add ten minutes to the baking time.',
    videoUrl: null,
    ingredients: [
      { heading: 'Eggplant', rows: [['eggplants', 2, 'piece'], ['olive oil', 3, 'tbsp'], ['salt', 0.5, 'tsp']] },
      { heading: 'Layers', rows: [
        ['tomato sauce', 400, 'ml'], ['fresh mozzarella', 200, 'g'], ['parmesan, grated', 30, 'g'], ['fresh basil', null, null],
      ] },
    ],
    steps: [
      { heading: 'Roast the eggplant', rows: [
        'Heat the oven to 200 C. Slice the eggplants into 1 cm rounds, brush them with olive oil and season with salt.',
        'Roast on two trays for 15 to 20 minutes, until soft and golden.',
      ] },
      { heading: 'Assemble and bake', rows: [
        { description: 'Layer the eggplant, tomato sauce and mozzarella in a baking dish, finishing with sauce and cheese.', photo: true },
        'Scatter the parmesan over the top and bake for 20 minutes, until bubbling.',
        'Rest for ten minutes so the layers hold, then scatter with basil and serve.',
      ] },
    ],
  },
  {
    slug: 'lemon-herb-hummus', title: 'Lemon Herb Hummus',
    description: 'Smooth chickpea dip with tahini, lemon and parsley.',
    servings: 6, prepTimeMinutes: 10, cookTimeMinutes: 0, categories: ['Snacks', 'Quick', 'Vegetarian'], favorite: false,
    notes: 'Blending the tahini with the lemon juice before adding the chickpeas makes the hummus extra creamy.',
    videoUrl: null,
    ingredients: [{ heading: null, rows: [
      ['chickpeas', 1, 'can'], ['tahini', 0.333, 'cup'], ['lemon juice', 3, 'tbsp'], ['garlic', 1, 'clove'], ['salt', 0.5, 'tsp'],
      ['ice water', 3, 'tbsp'], ['parsley, chopped', 2, 'tbsp'], ['olive oil', 1, 'tbsp'],
    ] }],
    steps: [{ heading: null, rows: [
      'Drain and rinse the chickpeas.',
      'Blend the tahini and lemon juice for one minute, until thick and pale.',
      'Add the chickpeas, garlic and salt and blend, pouring in the ice water until smooth.',
      'Pulse in the parsley, spoon into a bowl and drizzle with olive oil.',
    ] }],
  },
  {
    slug: 'raspberry-cheesecake-cups', title: 'Raspberry Cheesecake Cups',
    description: 'No-bake cream cheese cups on a crushed biscuit base, topped with raspberries.',
    servings: 4, prepTimeMinutes: 20, cookTimeMinutes: 0, categories: ['Desserts', 'Vegetarian'], favorite: false,
    notes: 'Make the cups up to a day ahead and add the raspberries just before serving.',
    videoUrl: null,
    ingredients: [
      { heading: 'Base', rows: [['digestive biscuits', 100, 'g'], ['butter, melted', 2, 'tbsp']] },
      { heading: 'Filling', rows: [['cream cheese', 200, 'g'], ['Greek yogurt', 0.5, 'cup'], ['powdered sugar', 0.333, 'cup'], ['lemon zest', 1, 'tsp']] },
      { heading: 'Topping', rows: [['raspberries', 150, 'g']] },
    ],
    steps: [
      { heading: 'Base', rows: ['Crush the biscuits, stir in the melted butter and press into the bottom of four small glasses.'] },
      { heading: 'Filling', rows: [
        'Beat the cream cheese, yogurt, powdered sugar and lemon zest until smooth.',
        'Spoon the filling over the bases, top with raspberries and chill for one hour.',
      ] },
    ],
  },
  {
    slug: 'sesame-edamame', title: 'Sesame Edamame',
    description: 'Warm shelled soybeans tossed with soy sauce, sesame oil and seeds.',
    servings: 4, prepTimeMinutes: 5, cookTimeMinutes: 5, categories: ['Snacks', 'Quick', 'Vegetarian'], favorite: false,
    notes: null,
    videoUrl: null,
    ingredients: [{ heading: null, rows: [
      ['shelled edamame', 300, 'g'], ['soy sauce', 1, 'tbsp'], ['toasted sesame oil', 1, 'tsp'], ['sesame seeds', 1, 'tbsp'], ['chili flakes', 0.25, 'tsp'],
    ] }],
    steps: [{ heading: null, rows: [
      'Boil the edamame for four to five minutes, until tender.',
      'Drain well and toss with the soy sauce and sesame oil.',
      'Scatter the sesame seeds and chili flakes over the beans and serve warm.',
    ] }],
  },
];

/** The recipe as the create form would submit it, with `categoryId` naming each of its Categories. */
export function templateMetadata(recipe: DemoTemplateRecipe, categoryId: (name: DemoTemplateCategory) => string): CreateRecipeMetadata {
  return {
    title: recipe.title, description: recipe.description, categoryIds: recipe.categories.map(categoryId),
    servings: recipe.servings, prepTimeMinutes: recipe.prepTimeMinutes, cookTimeMinutes: recipe.cookTimeMinutes,
    videoUrl: recipe.videoUrl, notes: recipe.notes,
    ingredients: recipe.ingredients.flatMap(({ heading, rows }) => rows.map(([name, quantity, unit], index) => ({
      name, quantity, unit, heading: index === 0 ? heading : null,
    }))),
    instructions: recipe.steps.flatMap(({ heading, rows }) => rows.map((step, index) => ({
      description: typeof step === 'string' ? step : step.description, hasImage: typeof step !== 'string', heading: index === 0 ? heading : null,
    }))),
  };
}
