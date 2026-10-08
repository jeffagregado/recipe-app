import { makeFixtures } from './fixture.js';

export const dinnerFixtures = makeFixtures('Dinner', 32, [
  {
    id: 'rosemary-roast-chicken', title: 'Rosemary Roast Chicken', description: 'Roast chicken thighs with rosemary potatoes.', prep: 15, cook: 40,
    ingredients: [['chicken thigh', 800, 'g'], ['potato', 500, 'g', 'quartered'], ['rosemary', 2, 'tsp'], ['olive oil', 2, 'tbsp']],
    instructions: ['Heat oven to 200 C and toss potatoes with oil and rosemary.', 'Arrange chicken over potatoes and roast for forty minutes.', 'Check chicken reaches 74 C, then rest for five minutes before serving.'],
  },
  {
    id: 'ginger-salmon-rice', title: 'Ginger Salmon Rice', description: 'Baked salmon with ginger glaze and steamed rice.', prep: 10, cook: 20,
    ingredients: [['salmon', 400, 'g'], ['rice', 200, 'g'], ['ginger', 1, 'tbsp', 'grated'], ['soy sauce', 2, 'tbsp'], ['honey', 1, 'tbsp']],
    instructions: ['Cook rice in water until tender.', 'Mix ginger, soy sauce and honey and brush over salmon.', 'Bake salmon at 200 C until it reaches 63 C and serve over rice.'],
  },
  {
    id: 'mushroom-pea-risotto', title: 'Mushroom Pea Risotto', description: 'Creamy rice with sauteed mushrooms and peas.', prep: 10, cook: 30,
    ingredients: [['arborio rice', 200, 'g'], ['mushrooms', 200, 'g', 'sliced'], ['peas', 100, 'g'], ['vegetable stock', 900, 'ml'], ['parmesan', 50, 'g']],
    instructions: ['Saute mushrooms in a lightly oiled pan, then stir in rice.', 'Add hot stock a ladle at a time, stirring until each addition absorbs.', 'When rice is tender, stir in peas and parmesan and cook for three minutes.'],
  },
  {
    id: 'black-bean-chili', title: 'Black Bean Chili', description: 'Slow-simmered beans and tomatoes with smoky spices.', prep: 10, cook: 30,
    ingredients: [['black beans', 2, 'can', 'drained'], ['tomato', 400, 'g', 'chopped'], ['bell pepper', 1, 'piece', 'diced'], ['cumin', 1, 'tsp'], ['smoked paprika', 1, 'tsp']],
    instructions: ['Soften diced pepper in a lightly oiled pot.', 'Stir in spices, beans, tomatoes and a cup of water.', 'Simmer for thirty minutes until thick, stirring occasionally and seasoning to taste.'], extra: 'Lunch',
  },
  {
    id: 'lemon-garlic-shrimp', title: 'Lemon Garlic Shrimp', description: 'Quick garlic shrimp with lemon and linguine.', prep: 10, cook: 12,
    ingredients: [['shrimp', 400, 'g', 'peeled'], ['linguine', 250, 'g'], ['garlic', 3, 'clove', 'minced'], ['lemon juice', 2, 'tbsp'], ['butter', 2, 'tbsp']],
    instructions: ['Boil linguine until al dente and reserve some cooking water.', 'Melt butter, soften garlic and cook shrimp until opaque and firm.', 'Toss with linguine and lemon juice, loosening with reserved water.'],
  },
  {
    id: 'eggplant-tomato-bake', title: 'Eggplant Tomato Bake', description: 'Layers of roasted eggplant, tomato and mozzarella.', prep: 15, cook: 35,
    ingredients: [['eggplant', 2, 'piece', 'sliced'], ['tomato sauce', 400, 'ml'], ['mozzarella', 200, 'g'], ['olive oil', 2, 'tbsp']],
    instructions: ['Brush eggplant slices with oil and roast at 200 C for fifteen minutes.', 'Layer eggplant, tomato sauce and mozzarella in a baking dish.', 'Bake for twenty minutes until bubbling and let rest before slicing.'],
  },
  {
    id: 'pork-pineapple-skewers', title: 'Pork Pineapple Skewers', description: 'Grilled pork and pineapple with a soy glaze.', prep: 15, cook: 15,
    ingredients: [['pork tenderloin', 500, 'g', 'cubed'], ['pineapple', 250, 'g', 'cubed'], ['soy sauce', 2, 'tbsp'], ['honey', 1, 'tbsp']],
    instructions: ['Soak wooden skewers and alternate pork with pineapple pieces.', 'Brush skewers with mixed soy sauce and honey.', 'Grill, turning often, until pork reaches 63 C; rest for three minutes.'],
  },
  {
    id: 'spinach-chickpea-stew', title: 'Spinach Chickpea Stew', description: 'Chickpeas in a cumin tomato broth with spinach.', prep: 8, cook: 20,
    ingredients: [['chickpeas', 2, 'can', 'drained'], ['spinach', 200, 'g'], ['tomato', 400, 'g', 'chopped'], ['cumin', 1, 'tsp'], ['vegetable stock', 300, 'ml']],
    instructions: ['Combine tomatoes, cumin and stock and bring to a simmer.', 'Add chickpeas and cook gently for fifteen minutes.', 'Stir in spinach until wilted and serve the stew hot.'], extra: 'Lunch',
  },
  {
    id: 'beef-mushroom-stroganoff', title: 'Beef Mushroom Stroganoff', description: 'Seared beef and mushrooms in a tangy cream sauce.', prep: 12, cook: 20,
    ingredients: [['beef', 400, 'g', 'sliced'], ['mushrooms', 250, 'g', 'sliced'], ['sour cream', 150, 'g'], ['beef stock', 200, 'ml'], ['onion', 1, 'piece', 'sliced']],
    instructions: ['Sear beef in a hot lightly oiled pan and remove.', 'Soften onion and mushrooms, add stock and simmer for ten minutes.', 'Return beef, heat through and stir in sour cream off the heat.'],
  },
  {
    id: 'coconut-vegetable-noodles', title: 'Coconut Vegetable Noodles', description: 'Rice noodles in a mild coconut curry broth.', prep: 10, cook: 15,
    ingredients: [['rice noodles', 200, 'g'], ['coconut milk', 400, 'ml'], ['carrot', 2, 'piece', 'sliced'], ['broccoli', 200, 'g'], ['curry powder', 1, 'tbsp']],
    instructions: ['Soak noodles according to package directions.', 'Simmer coconut milk, curry powder and vegetables until tender.', 'Add drained noodles and heat through with a splash of water.'],
  },
  {
    id: 'paprika-baked-cod', title: 'Paprika Baked Cod', description: 'White fish baked over tomatoes with smoked paprika.', prep: 10, cook: 20,
    ingredients: [['cod', 400, 'g'], ['tomato', 300, 'g', 'sliced'], ['smoked paprika', 1, 'tsp'], ['olive oil', 1, 'tbsp'], ['lemon juice', 1, 'tbsp']],
    instructions: ['Heat oven to 190 C and arrange tomatoes in a baking dish.', 'Place cod over tomatoes and coat with oil, paprika and lemon.', 'Bake for twenty minutes until fish reaches 63 C and flakes easily.'],
  },
  {
    id: 'stuffed-zucchini-boats', title: 'Stuffed Zucchini Boats', description: 'Zucchini filled with rice, tomatoes and feta.', prep: 15, cook: 30,
    ingredients: [['zucchini', 3, 'piece'], ['cooked rice', 2, 'cup'], ['tomato', 2, 'piece', 'diced'], ['feta', 100, 'g'], ['olive oil', 1, 'tbsp']],
    instructions: ['Halve zucchini and scoop out the centers.', 'Mix chopped centers with rice, tomatoes and feta and fill the halves.', 'Brush with oil and bake at 190 C for thirty minutes until tender.'], extra: 'Lunch',
  },
  {
    id: 'chicken-peanut-noodles', title: 'Chicken Peanut Noodles', description: 'Noodles and cooked chicken in a peanut sauce.', prep: 10, cook: 10,
    ingredients: [['egg noodles', 250, 'g'], ['cooked chicken', 250, 'g', 'sliced'], ['peanut butter', 3, 'tbsp'], ['soy sauce', 2, 'tbsp'], ['lime juice', 1, 'tbsp']],
    instructions: ['Boil noodles and reserve half a cup of cooking water.', 'Whisk peanut butter, soy sauce and lime juice with enough water to make a sauce.', 'Toss noodles, chicken and sauce in a pan until steaming hot.'],
  },
  {
    id: 'sausage-white-bean-pot', title: 'Sausage White Bean Pot', description: 'A hearty pot of sausages, white beans and tomato.', prep: 10, cook: 30,
    ingredients: [['sausage', 400, 'g'], ['white beans', 2, 'can', 'drained'], ['tomato', 400, 'g', 'chopped'], ['onion', 1, 'piece', 'diced']],
    instructions: ['Brown sausages in a pan and add diced onion.', 'Stir in beans, tomatoes and a cup of water.', 'Simmer for thirty minutes until sausages reach 74 C and sauce thickens.'],
  },
  {
    id: 'cauliflower-lentil-traybake', title: 'Cauliflower Lentil Traybake', description: 'Roasted cauliflower with lentils and a yogurt drizzle.', prep: 12, cook: 30,
    ingredients: [['cauliflower', 1, 'piece', 'florets'], ['cooked lentils', 300, 'g'], ['yogurt', 100, 'g'], ['cumin', 1, 'tsp'], ['olive oil', 2, 'tbsp']],
    instructions: ['Toss cauliflower with oil and cumin and roast at 200 C for twenty-five minutes.', 'Add lentils to the tray and heat for another five minutes.', 'Divide between plates and drizzle with yogurt.'],
  },
  {
    id: 'tomato-basil-gnocchi', title: 'Tomato Basil Gnocchi', description: 'Potato gnocchi tossed in a fresh tomato sauce.', prep: 8, cook: 15,
    ingredients: [['gnocchi', 500, 'g'], ['tomato', 400, 'g', 'chopped'], ['garlic', 2, 'clove', 'minced'], ['basil', 10, 'g'], ['olive oil', 1, 'tbsp']],
    instructions: ['Soften garlic in oil, add tomatoes and simmer for ten minutes.', 'Boil gnocchi until they float, then drain.', 'Toss gnocchi with tomato sauce and torn basil and serve hot.'], extra: 'Lunch',
  },
]);
