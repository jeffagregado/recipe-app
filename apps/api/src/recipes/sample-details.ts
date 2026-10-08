import type { MeasurementUnit } from '@recipe-app/contracts/types';

type SeedIngredient = readonly [name: string, quantity: number, unit: MeasurementUnit, preparation?: string];
type SeedDetails = { ingredients: readonly SeedIngredient[]; instructions: readonly string[] };

const pasta: SeedDetails = {
  ingredients: [['pasta', 300, 'g'], ['garlic', 4, 'clove', 'minced'], ['cream', 200, 'ml'], ['parmesan', 50, 'g', 'grated'], ['butter', 2, 'tbsp']],
  instructions: ['Boil pasta in salted water until al dente, reserving a cup of cooking water.', 'Melt butter over medium heat and gently cook minced garlic for one minute.', 'Stir in cream and parmesan, then toss with pasta. Loosen with cooking water and serve warm.'],
};

export const sampleDetails: Readonly<Record<string, SeedDetails>> = {
  'creamy-garlic-pasta': pasta,
  'creamy-garlic-pasta2': pasta,
  'creamy-garlic-pasta3': pasta,
  'creamy-garlic-pasta4': pasta,
  'banana-oat-pancakes': {
    ingredients: [['rolled oats', 100, 'g'], ['banana', 1, 'piece', 'mashed'], ['egg', 1, 'piece'], ['milk', 100, 'ml'], ['maple syrup', 2, 'tbsp']],
    instructions: ['Blend oats to a flour, then mix with mashed banana, egg and milk.', 'Heat a lightly greased pan and cook small pancakes until bubbles appear. Flip and cook until golden.', 'Serve the pancakes warm with maple syrup.'],
  },
  'spinach-feta-omelette': {
    ingredients: [['egg', 2, 'piece'], ['spinach', 50, 'g'], ['feta', 30, 'g', 'crumbled'], ['olive oil', 1, 'tsp']],
    instructions: ['Whisk the eggs and crumble the feta.', 'Warm olive oil in a pan and wilt the spinach.', 'Pour in the eggs, cook gently until nearly set, then add feta and fold the omelette.'],
  },
  'berry-overnight-oats': {
    ingredients: [['rolled oats', 100, 'g'], ['milk', 200, 'ml'], ['yogurt', 100, 'g'], ['mixed berries', 150, 'g']],
    instructions: ['Stir oats, milk and yogurt together in two covered jars.', 'Refrigerate overnight or for at least six hours.', 'Stir again and top with washed mixed berries before serving.'],
  },
  'avocado-egg-toast': {
    ingredients: [['whole-grain bread', 2, 'slice'], ['avocado', 1, 'piece'], ['egg', 2, 'piece'], ['lemon juice', 1, 'tbsp']],
    instructions: ['Mash avocado with lemon juice and a pinch of salt.', 'Poach eggs in gently simmering water until the whites set, about three minutes.', 'Toast the bread, spread with avocado and top each slice with a drained poached egg.'],
  },
  'lemon-chickpea-salad': {
    ingredients: [['chickpeas', 2, 'can', 'drained'], ['cucumber', 1, 'piece', 'diced'], ['cherry tomatoes', 200, 'g', 'halved'], ['parsley', 2, 'tbsp', 'chopped'], ['lemon juice', 2, 'tbsp'], ['olive oil', 2, 'tbsp']],
    instructions: ['Drain and rinse chickpeas, then dice cucumber and halve tomatoes.', 'Whisk lemon juice and olive oil with a pinch of salt.', 'Toss vegetables, chickpeas and parsley with the dressing and serve chilled.'],
  },
  'grilled-chicken-wraps': {
    ingredients: [['chicken breast', 300, 'g'], ['tortilla', 2, 'piece'], ['lettuce', 50, 'g'], ['yogurt', 100, 'g'], ['parsley', 1, 'tbsp', 'chopped']],
    instructions: ['Season chicken and grill until its center reaches 74 C. Rest and slice.', 'Stir parsley into yogurt and warm the tortillas.', 'Fill tortillas with lettuce, sliced chicken and yogurt sauce, then roll tightly.'],
  },
  'tomato-basil-soup': {
    ingredients: [['tomato', 800, 'g', 'chopped'], ['garlic', 3, 'clove', 'minced'], ['basil', 10, 'g'], ['vegetable stock', 500, 'ml'], ['olive oil', 1, 'tbsp'], ['baguette', 4, 'slice']],
    instructions: ['Soften garlic in olive oil without browning.', 'Add tomatoes and vegetable stock, then simmer for twenty-five minutes.', 'Add basil and blend until smooth. Season and serve with crusty bread.'],
  },
  'vegetable-fried-rice': {
    ingredients: [['cooked rice', 3, 'cup', 'chilled'], ['carrot', 1, 'piece', 'diced'], ['peas', 100, 'g'], ['egg', 2, 'piece'], ['soy sauce', 2, 'tbsp'], ['vegetable oil', 1, 'tbsp']],
    instructions: ['Heat oil in a wok and stir-fry carrot and peas until tender.', 'Push vegetables aside and scramble the eggs in the pan.', 'Add chilled rice and soy sauce, breaking up clumps. Stir-fry until steaming hot throughout.'],
  },
  'chicken-adobo': {
    ingredients: [['chicken thigh', 800, 'g'], ['vinegar', 80, 'ml'], ['soy sauce', 80, 'ml'], ['garlic', 6, 'clove', 'crushed'], ['bay leaf', 2, 'piece'], ['cooked rice', 4, 'cup']],
    instructions: ['Combine chicken, vinegar, soy sauce, crushed garlic, bay leaves and a cup of water in a pot.', 'Bring to a boil, then simmer covered until chicken reaches 74 C and is tender.', 'Uncover and reduce the sauce slightly. Remove bay leaves and serve over steamed rice.'],
  },
  'lemon-herb-baked-salmon': {
    ingredients: [['salmon', 300, 'g'], ['lemon juice', 2, 'tbsp'], ['dill', 1, 'tbsp', 'chopped'], ['olive oil', 1, 'tbsp'], ['carrot', 2, 'piece', 'sliced']],
    instructions: ['Heat the oven to 200 C. Toss sliced carrots with half the oil and roast for ten minutes.', 'Place salmon beside the carrots and coat with lemon juice, dill and remaining oil.', 'Bake until salmon reaches 63 C and carrots are tender, about fifteen minutes.'],
  },
  'beef-broccoli-stir-fry': {
    ingredients: [['beef', 500, 'g', 'thinly sliced'], ['broccoli', 400, 'g', 'cut into florets'], ['ginger', 1, 'tbsp', 'grated'], ['garlic', 3, 'clove', 'minced'], ['soy sauce', 3, 'tbsp'], ['cooked rice', 4, 'cup']],
    instructions: ['Mix soy sauce with ginger, garlic and three tablespoons of water.', 'Stir-fry beef in a hot lightly oiled wok, then remove to a plate.', 'Stir-fry broccoli with a splash of water until tender. Return beef, add sauce and heat through; serve over rice.'],
  },
  'coconut-lentil-curry': {
    ingredients: [['red lentils', 250, 'g'], ['coconut milk', 400, 'ml'], ['tomato', 400, 'g', 'chopped'], ['curry powder', 2, 'tbsp'], ['spinach', 100, 'g']],
    instructions: ['Rinse lentils and combine with coconut milk, tomatoes, curry powder and two cups of water.', 'Simmer gently for twenty-five minutes, stirring occasionally, until lentils soften.', 'Fold in spinach until wilted and season to taste before serving.'],
  },
  'roasted-paprika-chickpeas': {
    ingredients: [['chickpeas', 2, 'can', 'drained'], ['olive oil', 1, 'tbsp'], ['smoked paprika', 1, 'tsp'], ['sea salt', 1, 'pinch']],
    instructions: ['Heat the oven to 200 C. Drain chickpeas and pat completely dry.', 'Toss with olive oil, smoked paprika and sea salt; spread on a baking tray.', 'Roast for thirty minutes, shaking halfway through, until crisp. Cool slightly before serving.'],
  },
  'fresh-tomato-bruschetta': {
    ingredients: [['baguette', 8, 'slice'], ['tomato', 300, 'g', 'diced'], ['basil', 1, 'tbsp', 'chopped'], ['garlic', 1, 'clove'], ['olive oil', 2, 'tbsp']],
    instructions: ['Toss diced tomatoes with basil, olive oil and a pinch of salt.', 'Toast baguette slices until crisp and rub lightly with the cut garlic clove.', 'Spoon tomato mixture over the toast just before serving.'],
  },
  'fudgy-chocolate-brownies': {
    ingredients: [['dark chocolate', 200, 'g'], ['butter', 150, 'g'], ['sugar', 180, 'g'], ['egg', 3, 'piece'], ['flour', 80, 'g']],
    instructions: ['Heat the oven to 175 C and line a square baking pan.', 'Melt chocolate and butter. Cool briefly, whisk in sugar and eggs, then fold in flour.', 'Spread batter in the pan and bake for twenty-five minutes until the center is just set. Cool before cutting.'],
  },
  'mango-yogurt-parfait': {
    ingredients: [['mango', 1, 'piece', 'diced'], ['yogurt', 300, 'g'], ['granola', 80, 'g'], ['honey', 1, 'tbsp']],
    instructions: ['Peel and dice the mango, removing the stone.', 'Layer yogurt, mango and granola in two glasses.', 'Drizzle with honey and serve immediately to keep the granola crisp.'],
  },
};
