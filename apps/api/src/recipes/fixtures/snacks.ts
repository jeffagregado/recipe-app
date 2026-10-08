import { makeFixtures } from './fixture.js';

export const snackFixtures = makeFixtures('Snacks', 48, [
  {
    id: 'lemon-herb-hummus', title: 'Lemon Herb Hummus', description: 'Smooth chickpea dip with lemon and parsley.', prep: 10, cook: 0,
    ingredients: [['chickpeas', 1, 'can', 'drained'], ['tahini', 2, 'tbsp'], ['lemon juice', 2, 'tbsp'], ['parsley', 1, 'tbsp'], ['olive oil', 1, 'tbsp']],
    instructions: ['Drain and rinse chickpeas.', 'Blend with tahini, lemon juice, parsley and a splash of water until smooth.', 'Spoon into a bowl and drizzle with olive oil.'],
  },
  {
    id: 'oven-sweet-potato-wedges', title: 'Oven Sweet Potato Wedges', description: 'Crisp-edged wedges with smoked paprika.', prep: 10, cook: 30,
    ingredients: [['sweet potato', 500, 'g'], ['olive oil', 2, 'tbsp'], ['smoked paprika', 1, 'tsp'], ['sea salt', 1, 'pinch']],
    instructions: ['Heat oven to 210 C and cut sweet potatoes into wedges.', 'Toss with oil, paprika and salt and spread on a tray.', 'Roast for thirty minutes, turning halfway, until tender and browned.'],
  },
  {
    id: 'cucumber-yogurt-dip', title: 'Cucumber Yogurt Dip', description: 'Cool yogurt dip with grated cucumber and dill.', prep: 10, cook: 0,
    ingredients: [['yogurt', 250, 'g'], ['cucumber', 1, 'piece'], ['dill', 1, 'tbsp', 'chopped'], ['lemon juice', 1, 'tbsp']],
    instructions: ['Grate cucumber and squeeze out excess liquid.', 'Stir cucumber, dill and lemon juice into yogurt.', 'Refrigerate for thirty minutes and serve with vegetables or bread.'],
  },
  {
    id: 'spiced-popcorn', title: 'Spiced Popcorn', description: 'Fresh popcorn dusted with cumin and paprika.', prep: 5, cook: 8,
    ingredients: [['popcorn kernels', 80, 'g'], ['vegetable oil', 1, 'tbsp'], ['smoked paprika', 1, 'tsp'], ['cumin', 1, 'tsp']],
    instructions: ['Heat oil in a large covered pan and add kernels.', 'Shake gently while kernels pop and remove when popping slows.', 'Toss hot popcorn with paprika and cumin and serve.'],
  },
  {
    id: 'peanut-date-energy-bites', title: 'Peanut Date Energy Bites', description: 'Chewy oat bites held together with dates and peanuts.', prep: 15, cook: 0,
    ingredients: [['dates', 150, 'g'], ['rolled oats', 80, 'g'], ['peanut butter', 3, 'tbsp'], ['cocoa powder', 1, 'tbsp']],
    instructions: ['Remove date stones and soak dates briefly if firm.', 'Blend dates, oats, peanut butter and cocoa into a sticky mixture.', 'Roll into small balls and refrigerate for one hour.'], extra: 'Desserts',
  },
  {
    id: 'crispy-kale-chips', title: 'Crispy Kale Chips', description: 'Light oven-baked kale leaves with a little sea salt.', prep: 10, cook: 15,
    ingredients: [['kale', 200, 'g'], ['olive oil', 1, 'tbsp'], ['sea salt', 1, 'pinch']],
    instructions: ['Heat oven to 150 C and wash and thoroughly dry kale.', 'Remove stems, tear leaves and massage with oil and salt.', 'Spread in one layer and bake for fifteen minutes until crisp.'],
  },
  {
    id: 'baked-feta-tomato-dip', title: 'Baked Feta Tomato Dip', description: 'Warm feta softened among roasted cherry tomatoes.', prep: 5, cook: 20,
    ingredients: [['feta', 200, 'g'], ['cherry tomatoes', 250, 'g'], ['olive oil', 1, 'tbsp'], ['oregano', 1, 'tsp']],
    instructions: ['Place feta and tomatoes in a small baking dish.', 'Drizzle with oil and scatter oregano over the top.', 'Bake at 200 C for twenty minutes, then mash gently into a dip.'],
  },
  {
    id: 'avocado-lime-salsa', title: 'Avocado Lime Salsa', description: 'Chunky avocado salsa with tomato and coriander.', prep: 10, cook: 0,
    ingredients: [['avocado', 2, 'piece'], ['tomato', 1, 'piece', 'diced'], ['lime juice', 2, 'tbsp'], ['coriander', 2, 'tbsp', 'chopped']],
    instructions: ['Dice avocado and tomato into small pieces.', 'Gently combine with lime juice and chopped coriander.', 'Season and serve promptly with crisp tortilla wedges.'],
  },
  {
    id: 'sesame-edamame', title: 'Sesame Edamame', description: 'Warm soybeans dressed with sesame and soy.', prep: 5, cook: 5,
    ingredients: [['shelled edamame', 300, 'g'], ['soy sauce', 1, 'tbsp'], ['sesame oil', 1, 'tsp'], ['sesame seeds', 1, 'tbsp']],
    instructions: ['Boil edamame for five minutes or until tender.', 'Drain thoroughly and toss with soy sauce and sesame oil.', 'Scatter sesame seeds over the beans and serve warm.'], extra: 'Lunch',
  },
  {
    id: 'apple-cheddar-crackers', title: 'Apple Cheddar Crackers', description: 'Crisp crackers layered with apple and sharp cheddar.', prep: 8, cook: 0,
    ingredients: [['crackers', 12, 'piece'], ['apple', 1, 'piece'], ['cheddar', 100, 'g', 'sliced']],
    instructions: ['Wash apple, remove the core and cut into thin slices.', 'Arrange crackers on a plate and add cheddar slices.', 'Top with apple and serve before crackers soften.'],
  },
  {
    id: 'roasted-garlic-white-bean-dip', title: 'Roasted Garlic White Bean Dip', description: 'Creamy white beans blended with sweet roasted garlic.', prep: 10, cook: 30,
    ingredients: [['white beans', 1, 'can', 'drained'], ['garlic', 6, 'clove'], ['olive oil', 2, 'tbsp'], ['lemon juice', 1, 'tbsp']],
    instructions: ['Wrap garlic in foil with half the oil and roast at 190 C for thirty minutes.', 'Drain beans and squeeze softened garlic from its skins.', 'Blend beans and garlic with remaining oil, lemon and a splash of water.'],
  },
  {
    id: 'carrot-oat-muffins', title: 'Carrot Oat Muffins', description: 'Small savory muffins with grated carrot and oats.', prep: 15, cook: 20,
    ingredients: [['carrot', 150, 'g', 'grated'], ['flour', 150, 'g'], ['rolled oats', 50, 'g'], ['egg', 2, 'piece'], ['milk', 150, 'ml']],
    instructions: ['Heat oven to 180 C and grease a muffin tray.', 'Whisk eggs and milk and fold in flour, oats and grated carrot.', 'Divide into the tray and bake for twenty minutes until set.'], extra: 'Breakfast',
  },
  {
    id: 'chili-lime-corn-cups', title: 'Chili Lime Corn Cups', description: 'Warm sweetcorn with chili, lime and crumbled feta.', prep: 5, cook: 8,
    ingredients: [['sweetcorn', 300, 'g'], ['lime juice', 1, 'tbsp'], ['chili flakes', 1, 'tsp'], ['feta', 50, 'g']],
    instructions: ['Cook sweetcorn in a hot pan with a splash of water until tender.', 'Stir in lime juice and chili flakes.', 'Divide into cups and finish with crumbled feta.'],
  },
  {
    id: 'herbed-roasted-almonds', title: 'Herbed Roasted Almonds', description: 'Crunchy almonds scented with rosemary.', prep: 5, cook: 12,
    ingredients: [['almonds', 200, 'g'], ['olive oil', 1, 'tsp'], ['rosemary', 1, 'tsp'], ['sea salt', 1, 'pinch']],
    instructions: ['Heat oven to 170 C and toss almonds with oil, rosemary and salt.', 'Spread on a tray and roast for twelve minutes, stirring once.', 'Cool completely before serving or storing.'],
  },
  {
    id: 'tomato-olive-puff-tarts', title: 'Tomato Olive Puff Tarts', description: 'Small pastry squares with tomato and olives.', prep: 12, cook: 20,
    ingredients: [['puff pastry', 250, 'g'], ['cherry tomatoes', 150, 'g'], ['olives', 50, 'g'], ['feta', 60, 'g']],
    instructions: ['Heat oven to 200 C and cut pastry into small squares.', 'Top with halved tomatoes, sliced olives and crumbled feta, leaving edges clear.', 'Bake for twenty minutes until pastry is puffed and golden.'], extra: 'Lunch',
  },
  {
    id: 'banana-peanut-rice-cakes', title: 'Banana Peanut Rice Cakes', description: 'Crisp rice cakes with peanut butter and banana.', prep: 5, cook: 0,
    ingredients: [['rice cakes', 4, 'piece'], ['banana', 1, 'piece'], ['peanut butter', 2, 'tbsp'], ['cinnamon', 1, 'pinch']],
    instructions: ['Peel banana and cut into thin rounds.', 'Spread peanut butter over rice cakes and arrange banana slices.', 'Dust lightly with cinnamon and serve immediately.'],
  },
]);
