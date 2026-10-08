import { makeFixtures } from './fixture.js';

export const lunchFixtures = makeFixtures('Lunch', 16, [
  {
    id: 'quinoa-roasted-vegetable-bowl', title: 'Quinoa Roasted Vegetable Bowl', description: 'Roast vegetables over fluffy quinoa with lemon.', prep: 12, cook: 25,
    ingredients: [['quinoa', 150, 'g'], ['zucchini', 1, 'piece', 'diced'], ['carrot', 2, 'piece', 'sliced'], ['olive oil', 2, 'tbsp'], ['lemon juice', 1, 'tbsp']],
    instructions: ['Heat oven to 200 C, toss vegetables with oil and roast for twenty-five minutes.', 'Rinse quinoa and simmer in twice its volume of water until tender.', 'Divide quinoa and vegetables into bowls and dress with lemon juice.'],
  },
  {
    id: 'tuna-white-bean-salad', title: 'Tuna White Bean Salad', description: 'A bright salad of tuna, beans and parsley.', prep: 10, cook: 0,
    ingredients: [['tuna', 1, 'can', 'drained'], ['white beans', 1, 'can', 'drained'], ['parsley', 2, 'tbsp', 'chopped'], ['lemon juice', 2, 'tbsp'], ['olive oil', 1, 'tbsp']],
    instructions: ['Drain tuna and rinse white beans.', 'Whisk lemon juice with olive oil and chop parsley.', 'Gently toss everything together and serve chilled.'],
  },
  {
    id: 'pesto-mozzarella-panini', title: 'Pesto Mozzarella Panini', description: 'Pressed sandwiches with pesto, tomato and mozzarella.', prep: 8, cook: 8,
    ingredients: [['sourdough bread', 4, 'slice'], ['mozzarella', 150, 'g', 'sliced'], ['tomato', 1, 'piece', 'sliced'], ['pesto', 2, 'tbsp']],
    instructions: ['Spread pesto over bread and layer tomato and mozzarella on two slices.', 'Close sandwiches and place in a hot sandwich press.', 'Toast until bread is crisp and cheese melts, then slice and serve.'],
  },
  {
    id: 'sesame-soba-noodles', title: 'Sesame Soba Noodles', description: 'Chilled buckwheat noodles with cucumber and sesame.', prep: 10, cook: 8,
    ingredients: [['soba noodles', 200, 'g'], ['cucumber', 1, 'piece', 'sliced'], ['soy sauce', 2, 'tbsp'], ['sesame oil', 1, 'tbsp'], ['sesame seeds', 1, 'tbsp']],
    instructions: ['Boil soba according to package directions, then drain and rinse cold.', 'Whisk soy sauce with sesame oil and slice cucumber.', 'Toss noodles and cucumber with dressing and scatter sesame seeds on top.'], extra: 'Dinner',
  },
  {
    id: 'turkey-avocado-sandwich', title: 'Turkey Avocado Sandwich', description: 'Whole-grain sandwiches with turkey and creamy avocado.', prep: 10, cook: 0,
    ingredients: [['whole-grain bread', 4, 'slice'], ['cooked turkey', 150, 'g', 'sliced'], ['avocado', 1, 'piece'], ['lettuce', 50, 'g'], ['lemon juice', 1, 'tsp']],
    instructions: ['Mash avocado with lemon juice.', 'Spread avocado over bread and layer with washed lettuce and cooked turkey.', 'Close sandwiches, slice diagonally and serve immediately.'],
  },
  {
    id: 'red-lentil-tomato-soup', title: 'Red Lentil Tomato Soup', description: 'A warming lentil soup seasoned with cumin.', prep: 8, cook: 25,
    ingredients: [['red lentils', 200, 'g'], ['tomato', 400, 'g', 'chopped'], ['vegetable stock', 800, 'ml'], ['cumin', 1, 'tsp'], ['onion', 1, 'piece', 'diced']],
    instructions: ['Soften onion in a lightly oiled pot.', 'Add rinsed lentils, tomatoes, stock and cumin; simmer for twenty-five minutes.', 'Stir until lentils are soft, adjust seasoning and ladle into bowls.'],
  },
  {
    id: 'falafel-pita-pockets', title: 'Falafel Pita Pockets', description: 'Chickpea patties tucked into pita with yogurt.', prep: 15, cook: 20,
    ingredients: [['chickpeas', 2, 'can', 'drained'], ['flour', 2, 'tbsp'], ['cumin', 1, 'tsp'], ['pita bread', 4, 'piece'], ['yogurt', 100, 'g']],
    instructions: ['Heat oven to 200 C and mash chickpeas with flour and cumin.', 'Shape small patties, brush with oil and bake for twenty minutes, turning once.', 'Warm pita and fill with patties and yogurt.'],
  },
  {
    id: 'roasted-beet-feta-salad', title: 'Roasted Beet Feta Salad', description: 'Sweet roasted beets with feta and peppery greens.', prep: 10, cook: 40,
    ingredients: [['beetroot', 400, 'g'], ['feta', 100, 'g', 'crumbled'], ['arugula', 80, 'g'], ['olive oil', 2, 'tbsp'], ['balsamic vinegar', 1, 'tbsp']],
    instructions: ['Heat oven to 200 C, wrap beets and roast for forty minutes until tender.', 'Cool, peel and slice beets; wash and dry arugula.', 'Toss with oil and vinegar, then scatter crumbled feta over the salad.'], extra: 'Dinner',
  },
  {
    id: 'chicken-couscous-salad', title: 'Chicken Couscous Salad', description: 'Herby couscous with cooked chicken and tomatoes.', prep: 10, cook: 5,
    ingredients: [['couscous', 150, 'g'], ['cooked chicken', 200, 'g', 'sliced'], ['cherry tomatoes', 150, 'g', 'halved'], ['parsley', 2, 'tbsp'], ['lemon juice', 2, 'tbsp']],
    instructions: ['Cover couscous with equal volume of boiling water and rest for five minutes.', 'Fluff with a fork and let cool slightly.', 'Fold in chicken, tomatoes, parsley and lemon juice and serve.'],
  },
  {
    id: 'spinach-cheese-quesadillas', title: 'Spinach Cheese Quesadillas', description: 'Crisp tortillas filled with spinach and melted cheddar.', prep: 8, cook: 10,
    ingredients: [['tortilla', 4, 'piece'], ['spinach', 100, 'g'], ['cheddar', 150, 'g', 'grated'], ['salsa', 4, 'tbsp']],
    instructions: ['Wilt spinach in a pan and squeeze out excess moisture.', 'Layer spinach and cheese between tortillas.', 'Toast each side in a dry pan until crisp, then cut into wedges and serve with salsa.'],
  },
  {
    id: 'sweetcorn-potato-chowder', title: 'Sweetcorn Potato Chowder', description: 'Creamy vegetable chowder with sweetcorn kernels.', prep: 10, cook: 25,
    ingredients: [['sweetcorn', 250, 'g'], ['potato', 300, 'g', 'diced'], ['milk', 300, 'ml'], ['vegetable stock', 400, 'ml'], ['onion', 1, 'piece', 'diced']],
    instructions: ['Soften onion in a lightly oiled saucepan.', 'Add potato and stock and simmer until potatoes are tender.', 'Stir in sweetcorn and milk, heat gently for five minutes and season.'],
  },
  {
    id: 'mediterranean-barley-salad', title: 'Mediterranean Barley Salad', description: 'Chewy barley with olives, tomato and lemon.', prep: 10, cook: 30,
    ingredients: [['pearl barley', 150, 'g'], ['tomato', 2, 'piece', 'diced'], ['olives', 60, 'g'], ['lemon juice', 2, 'tbsp'], ['olive oil', 1, 'tbsp']],
    instructions: ['Simmer barley in plenty of water until tender, then drain and cool.', 'Dice tomatoes and slice olives.', 'Toss barley with vegetables, lemon juice and olive oil.'], extra: 'Dinner',
  },
  {
    id: 'ginger-tofu-lettuce-cups', title: 'Ginger Tofu Lettuce Cups', description: 'Ginger-scented tofu spooned into crisp lettuce.', prep: 10, cook: 12,
    ingredients: [['firm tofu', 300, 'g', 'crumbled'], ['ginger', 1, 'tbsp', 'grated'], ['soy sauce', 2, 'tbsp'], ['lettuce', 8, 'piece'], ['sesame oil', 1, 'tsp']],
    instructions: ['Drain tofu and crumble into small pieces.', 'Fry tofu in sesame oil with ginger and soy sauce until hot and lightly browned.', 'Wash and dry lettuce leaves and fill with warm tofu.'],
  },
  {
    id: 'roasted-pumpkin-hummus-wrap', title: 'Roasted Pumpkin Hummus Wrap', description: 'Roasted pumpkin and hummus rolled in warm tortillas.', prep: 10, cook: 25,
    ingredients: [['pumpkin', 400, 'g', 'diced'], ['tortilla', 4, 'piece'], ['hummus', 150, 'g'], ['spinach', 60, 'g'], ['olive oil', 1, 'tbsp']],
    instructions: ['Toss pumpkin with oil and roast at 200 C for twenty-five minutes.', 'Warm tortillas and spread with hummus.', 'Add spinach and roasted pumpkin, fold the sides and roll tightly.'],
  },
  {
    id: 'caprese-pasta-salad', title: 'Caprese Pasta Salad', description: 'Cool pasta with mozzarella, tomato and fresh basil.', prep: 10, cook: 12,
    ingredients: [['pasta', 250, 'g'], ['mozzarella', 150, 'g'], ['cherry tomatoes', 200, 'g'], ['basil', 10, 'g'], ['olive oil', 2, 'tbsp']],
    instructions: ['Boil pasta until al dente, drain and cool.', 'Halve tomatoes and tear mozzarella and basil into pieces.', 'Toss with pasta and olive oil, season and refrigerate until serving.'],
  },
  {
    id: 'pea-mint-frittata', title: 'Pea Mint Frittata', description: 'A tender baked egg dish with peas and mint.', prep: 8, cook: 20,
    ingredients: [['egg', 6, 'piece'], ['peas', 150, 'g'], ['mint', 1, 'tbsp', 'chopped'], ['feta', 80, 'g', 'crumbled']],
    instructions: ['Heat oven to 180 C and lightly oil a small baking dish.', 'Whisk eggs and fold in peas, mint and feta.', 'Pour into the dish and bake for twenty minutes until the center is set.'], extra: 'Breakfast',
  },
]);
