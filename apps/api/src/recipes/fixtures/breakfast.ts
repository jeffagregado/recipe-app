import { makeFixtures } from './fixture.js';

export const breakfastFixtures = makeFixtures('Breakfast', 0, [
  {
    id: 'apple-cinnamon-porridge', title: 'Apple Cinnamon Porridge', description: 'Warm oats with softened apple and cinnamon.', prep: 5, cook: 12,
    ingredients: [['rolled oats', 100, 'g'], ['milk', 300, 'ml'], ['apple', 1, 'piece', 'diced'], ['cinnamon', 1, 'tsp']],
    instructions: ['Dice the apple and combine oats, milk and cinnamon in a saucepan.', 'Simmer for twelve minutes, stirring and adding the apple halfway through.', 'Divide the creamy porridge among bowls and serve warm.'],
  },
  {
    id: 'tomato-scrambled-eggs', title: 'Tomato Scrambled Eggs', description: 'Soft scrambled eggs with juicy tomatoes and toast.', prep: 5, cook: 8,
    ingredients: [['egg', 4, 'piece'], ['tomato', 2, 'piece', 'diced'], ['butter', 1, 'tbsp'], ['whole-grain bread', 4, 'slice']],
    instructions: ['Whisk eggs and dice tomatoes.', 'Melt butter, cook tomatoes for three minutes and stir in eggs over low heat until set.', 'Toast bread and serve with the eggs.'],
  },
  {
    id: 'blueberry-yogurt-bowl', title: 'Blueberry Yogurt Bowl', description: 'Cool yogurt with blueberries, seeds and crunchy oats.', prep: 5, cook: 0,
    ingredients: [['yogurt', 300, 'g'], ['blueberries', 150, 'g'], ['rolled oats', 50, 'g'], ['chia seeds', 1, 'tbsp']],
    instructions: ['Wash and drain blueberries.', 'Divide yogurt between bowls and scatter over oats and chia seeds.', 'Top with blueberries and serve immediately.'], extra: 'Snacks',
  },
  {
    id: 'mushroom-breakfast-toast', title: 'Mushroom Breakfast Toast', description: 'Golden mushrooms piled on crisp sourdough.', prep: 8, cook: 10,
    ingredients: [['mushrooms', 250, 'g', 'sliced'], ['sourdough bread', 4, 'slice'], ['olive oil', 1, 'tbsp'], ['thyme', 1, 'tsp']],
    instructions: ['Clean and slice mushrooms and toast the bread.', 'Saute mushrooms in olive oil with thyme until golden and their liquid evaporates.', 'Spoon the hot mushrooms over toast and season to taste.'],
  },
  {
    id: 'peanut-banana-smoothie', title: 'Peanut Banana Smoothie', description: 'A creamy banana drink with peanut butter and oats.', prep: 5, cook: 0,
    ingredients: [['banana', 2, 'piece'], ['milk', 300, 'ml'], ['peanut butter', 2, 'tbsp'], ['rolled oats', 30, 'g']],
    instructions: ['Peel bananas and break into chunks.', 'Blend banana, milk, peanut butter and oats until smooth.', 'Pour into chilled glasses and serve immediately.'],
  },
  {
    id: 'sweet-potato-breakfast-hash', title: 'Sweet Potato Breakfast Hash', description: 'Tender sweet potato cubes with peppers and eggs.', prep: 12, cook: 20,
    ingredients: [['sweet potato', 400, 'g', 'diced'], ['bell pepper', 1, 'piece', 'diced'], ['egg', 2, 'piece'], ['olive oil', 1, 'tbsp']],
    instructions: ['Dice sweet potato and pepper into small even pieces.', 'Saute in olive oil, covered, until tender, stirring often for fifteen minutes.', 'Make two wells, crack in eggs and cover until whites and yolks are set.'], extra: 'Lunch',
  },
  {
    id: 'lemon-ricotta-pancakes', title: 'Lemon Ricotta Pancakes', description: 'Fluffy pancakes brightened with lemon and ricotta.', prep: 10, cook: 15,
    ingredients: [['ricotta', 150, 'g'], ['flour', 100, 'g'], ['egg', 2, 'piece'], ['milk', 100, 'ml'], ['lemon zest', 1, 'tsp']],
    instructions: ['Whisk ricotta, eggs, milk and lemon zest, then fold in flour.', 'Spoon batter into a lightly greased pan over medium heat.', 'Flip when the bottoms turn golden and cook through on the second side.'],
  },
  {
    id: 'coconut-chia-pudding', title: 'Coconut Chia Pudding', description: 'Overnight coconut pudding with fresh pineapple.', prep: 10, cook: 0,
    ingredients: [['chia seeds', 50, 'g'], ['coconut milk', 300, 'ml'], ['pineapple', 150, 'g', 'diced'], ['honey', 1, 'tbsp']],
    instructions: ['Stir chia seeds, coconut milk and honey in a covered bowl.', 'Refrigerate for at least six hours, stirring once after ten minutes.', 'Divide into cups and top with diced pineapple.'], extra: 'Desserts',
  },
  {
    id: 'cheddar-chive-scones', title: 'Cheddar Chive Scones', description: 'Savory baked scones with cheddar and fresh chives.', prep: 15, cook: 20,
    ingredients: [['flour', 250, 'g'], ['butter', 60, 'g'], ['cheddar', 100, 'g', 'grated'], ['milk', 150, 'ml'], ['chives', 2, 'tbsp', 'chopped']],
    instructions: ['Heat oven to 200 C and rub butter into flour.', 'Mix in cheddar and chives, add milk and gently bring the dough together.', 'Pat out, cut into rounds and bake for twenty minutes until golden.'],
  },
  {
    id: 'breakfast-bean-tacos', title: 'Breakfast Bean Tacos', description: 'Warm tortillas filled with beans, eggs and salsa.', prep: 8, cook: 10,
    ingredients: [['black beans', 1, 'can', 'drained'], ['egg', 3, 'piece'], ['tortilla', 4, 'piece'], ['salsa', 4, 'tbsp']],
    instructions: ['Warm drained beans in a pan and heat tortillas separately.', 'Scramble eggs over gentle heat until fully set.', 'Fill tortillas with beans and eggs, then spoon salsa over each taco.'], extra: 'Lunch',
  },
  {
    id: 'pear-walnut-muesli', title: 'Pear Walnut Muesli', description: 'Soaked oats with ripe pear and toasted walnuts.', prep: 8, cook: 0,
    ingredients: [['rolled oats', 100, 'g'], ['yogurt', 200, 'g'], ['pear', 1, 'piece', 'diced'], ['walnuts', 40, 'g']],
    instructions: ['Mix oats with yogurt and refrigerate for at least one hour.', 'Wash and dice the pear, discarding its core.', 'Fold pear into oats and scatter walnuts on top before serving.'],
  },
  {
    id: 'baked-egg-peppers', title: 'Baked Egg Peppers', description: 'Roasted pepper halves holding tender baked eggs.', prep: 10, cook: 25,
    ingredients: [['bell pepper', 2, 'piece'], ['egg', 4, 'piece'], ['spinach', 50, 'g'], ['olive oil', 1, 'tsp']],
    instructions: ['Heat oven to 190 C and halve peppers, removing seeds.', 'Brush with oil, fill with spinach and roast for ten minutes.', 'Crack an egg into each half and bake until whites and yolks are set.'],
  },
  {
    id: 'strawberry-french-toast', title: 'Strawberry French Toast', description: 'Golden egg-soaked bread with fresh strawberries.', prep: 8, cook: 10,
    ingredients: [['whole-grain bread', 4, 'slice'], ['egg', 2, 'piece'], ['milk', 100, 'ml'], ['strawberries', 150, 'g'], ['butter', 1, 'tbsp']],
    instructions: ['Whisk eggs and milk; dip bread slices briefly on both sides.', 'Fry in butter over medium heat until golden and cooked through.', 'Hull and slice strawberries, then arrange over the warm toast.'],
  },
  {
    id: 'ginger-rice-congee', title: 'Ginger Rice Congee', description: 'Soft rice porridge with ginger and spring onions.', prep: 5, cook: 45,
    ingredients: [['rice', 100, 'g'], ['vegetable stock', 1, 'l'], ['ginger', 1, 'tbsp', 'grated'], ['spring onion', 2, 'piece', 'sliced']],
    instructions: ['Rinse rice and combine with stock and ginger in a pot.', 'Simmer gently for forty-five minutes, stirring until rice breaks down.', 'Ladle into bowls and finish with sliced spring onions.'], extra: 'Lunch',
  },
  {
    id: 'orange-date-granola', title: 'Orange Date Granola', description: 'Crisp baked oats with dates and orange zest.', prep: 10, cook: 25,
    ingredients: [['rolled oats', 200, 'g'], ['dates', 80, 'g', 'chopped'], ['orange zest', 1, 'tbsp'], ['honey', 3, 'tbsp'], ['vegetable oil', 2, 'tbsp']],
    instructions: ['Heat oven to 160 C and mix oats, orange zest, honey and oil.', 'Spread on a tray and bake for twenty-five minutes, stirring halfway.', 'Cool completely, stir in dates and store in a sealed container.'],
  },
  {
    id: 'herbed-cottage-cheese-bowl', title: 'Herbed Cottage Cheese Bowl', description: 'Cottage cheese with cucumber, dill and crisp toast.', prep: 8, cook: 0,
    ingredients: [['cottage cheese', 300, 'g'], ['cucumber', 1, 'piece', 'diced'], ['dill', 1, 'tbsp', 'chopped'], ['whole-grain bread', 2, 'slice']],
    instructions: ['Dice cucumber and finely chop dill.', 'Fold cucumber and dill into cottage cheese and divide among bowls.', 'Toast bread and serve alongside the cheese bowls.'],
  },
]);
