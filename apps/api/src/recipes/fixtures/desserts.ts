import { makeFixtures } from './fixture.js';

export const dessertFixtures = makeFixtures('Desserts', 64, [
  {
    id: 'baked-cinnamon-apples', title: 'Baked Cinnamon Apples', description: 'Soft baked apples filled with oats and honey.', prep: 10, cook: 30,
    ingredients: [['apple', 4, 'piece'], ['rolled oats', 60, 'g'], ['honey', 2, 'tbsp'], ['cinnamon', 1, 'tsp'], ['butter', 20, 'g']],
    instructions: ['Core apples and place in a baking dish.', 'Mix oats, honey, cinnamon and softened butter and fill apple centers.', 'Bake at 180 C for thirty minutes until apples are tender.'],
  },
  {
    id: 'lemon-yogurt-loaf', title: 'Lemon Yogurt Loaf', description: 'A moist yogurt cake with fresh lemon zest.', prep: 15, cook: 40,
    ingredients: [['flour', 200, 'g'], ['yogurt', 150, 'g'], ['sugar', 120, 'g'], ['egg', 2, 'piece'], ['lemon zest', 1, 'tbsp']],
    instructions: ['Heat oven to 175 C and line a loaf tin.', 'Whisk yogurt, eggs and sugar, then fold in flour and lemon zest.', 'Bake for forty minutes until a skewer comes out clean and cool before slicing.'],
  },
  {
    id: 'dark-chocolate-mousse', title: 'Dark Chocolate Mousse', description: 'A chilled chocolate mousse made with whipped cream.', prep: 15, cook: 5,
    ingredients: [['dark chocolate', 150, 'g'], ['cream', 250, 'ml'], ['sugar', 2, 'tbsp']],
    instructions: ['Melt chocolate gently and let cool until just warm.', 'Whip cream with sugar until soft peaks form.', 'Fold cream into chocolate, spoon into cups and chill for two hours.'],
  },
  {
    id: 'peach-oat-crumble', title: 'Peach Oat Crumble', description: 'Juicy peaches under a buttery oat topping.', prep: 12, cook: 30,
    ingredients: [['peach', 4, 'piece', 'sliced'], ['rolled oats', 100, 'g'], ['flour', 50, 'g'], ['butter', 70, 'g'], ['sugar', 60, 'g']],
    instructions: ['Heat oven to 180 C and arrange peaches in a baking dish.', 'Rub butter into flour, oats and sugar and scatter over fruit.', 'Bake for thirty minutes until golden and bubbling.'], extra: 'Snacks',
  },
  {
    id: 'strawberry-yogurt-pops', title: 'Strawberry Yogurt Pops', description: 'Frozen strawberry and yogurt treats.', prep: 10, cook: 0,
    ingredients: [['strawberries', 250, 'g'], ['yogurt', 300, 'g'], ['honey', 2, 'tbsp']],
    instructions: ['Wash and hull strawberries and blend with honey.', 'Swirl the fruit puree into yogurt and fill ice-pop molds.', 'Freeze for at least six hours before unmolding.'],
  },
  {
    id: 'coconut-rice-pudding', title: 'Coconut Rice Pudding', description: 'Creamy rice pudding simmered in coconut milk.', prep: 5, cook: 30,
    ingredients: [['rice', 100, 'g'], ['coconut milk', 400, 'ml'], ['milk', 200, 'ml'], ['sugar', 50, 'g']],
    instructions: ['Rinse rice and combine with coconut milk and milk.', 'Simmer gently for thirty minutes, stirring often until rice is soft.', 'Stir in sugar and serve warm or refrigerate until chilled.'],
  },
  {
    id: 'almond-orange-cookies', title: 'Almond Orange Cookies', description: 'Small almond cookies with fragrant orange zest.', prep: 15, cook: 15,
    ingredients: [['ground almonds', 150, 'g'], ['flour', 80, 'g'], ['butter', 80, 'g'], ['sugar', 80, 'g'], ['orange zest', 1, 'tbsp']],
    instructions: ['Cream butter and sugar, then mix in almonds, flour and zest.', 'Roll into small balls and flatten on a lined tray.', 'Bake at 175 C for fifteen minutes and cool on a rack.'],
  },
  {
    id: 'mango-coconut-sorbet', title: 'Mango Coconut Sorbet', description: 'A dairy-free frozen blend of mango and coconut.', prep: 10, cook: 0,
    ingredients: [['mango', 500, 'g', 'diced'], ['coconut milk', 200, 'ml'], ['lime juice', 1, 'tbsp'], ['sugar', 50, 'g']],
    instructions: ['Freeze diced mango in a single layer until firm.', 'Blend frozen mango with coconut milk, lime juice and sugar.', 'Transfer to a covered container and freeze for two hours before scooping.'], extra: 'Snacks',
  },
  {
    id: 'raspberry-cheesecake-cups', title: 'Raspberry Cheesecake Cups', description: 'No-bake cream cheese cups with crushed biscuits.', prep: 15, cook: 0,
    ingredients: [['cream cheese', 200, 'g'], ['yogurt', 100, 'g'], ['biscuits', 80, 'g'], ['raspberries', 150, 'g'], ['sugar', 40, 'g']],
    instructions: ['Crush biscuits and divide among small glasses.', 'Beat cream cheese, yogurt and sugar until smooth and spoon over crumbs.', 'Top with washed raspberries and chill for one hour.'],
  },
  {
    id: 'banana-walnut-bread', title: 'Banana Walnut Bread', description: 'A tender banana loaf with chopped walnuts.', prep: 15, cook: 45,
    ingredients: [['banana', 3, 'piece'], ['flour', 200, 'g'], ['egg', 2, 'piece'], ['sugar', 100, 'g'], ['walnuts', 80, 'g']],
    instructions: ['Heat oven to 175 C and line a loaf tin.', 'Mash bananas and mix with eggs and sugar, then fold in flour and walnuts.', 'Bake for forty-five minutes until cooked through and cool before slicing.'],
  },
  {
    id: 'vanilla-poached-pears', title: 'Vanilla Poached Pears', description: 'Tender pears gently poached in vanilla syrup.', prep: 10, cook: 25,
    ingredients: [['pear', 4, 'piece'], ['sugar', 100, 'g'], ['vanilla extract', 1, 'tsp'], ['lemon juice', 1, 'tbsp']],
    instructions: ['Peel pears, leaving stems intact.', 'Bring sugar, vanilla and lemon juice to a simmer with 600 ml water.', 'Add pears and poach for twenty-five minutes until tender, turning occasionally.'],
  },
  {
    id: 'chocolate-hazelnut-bark', title: 'Chocolate Hazelnut Bark', description: 'Thin dark chocolate scattered with roasted hazelnuts.', prep: 10, cook: 5,
    ingredients: [['dark chocolate', 200, 'g'], ['hazelnuts', 80, 'g'], ['sea salt', 1, 'pinch']],
    instructions: ['Chop hazelnuts and melt chocolate gently.', 'Spread chocolate thinly on a lined tray and scatter with nuts and salt.', 'Refrigerate until firm, then break into pieces.'], extra: 'Snacks',
  },
  {
    id: 'pineapple-lime-fruit-salad', title: 'Pineapple Lime Fruit Salad', description: 'Fresh pineapple and melon with a lime dressing.', prep: 12, cook: 0,
    ingredients: [['pineapple', 300, 'g', 'diced'], ['melon', 300, 'g', 'diced'], ['lime juice', 2, 'tbsp'], ['mint', 1, 'tbsp', 'chopped']],
    instructions: ['Peel fruit and cut into even bite-size pieces.', 'Toss pineapple and melon with lime juice and chopped mint.', 'Chill for twenty minutes before serving.'],
  },
  {
    id: 'baked-berry-custard', title: 'Baked Berry Custard', description: 'Light baked custard studded with mixed berries.', prep: 10, cook: 30,
    ingredients: [['mixed berries', 200, 'g'], ['egg', 3, 'piece'], ['milk', 300, 'ml'], ['sugar', 60, 'g'], ['vanilla extract', 1, 'tsp']],
    instructions: ['Heat oven to 170 C and place berries in ramekins.', 'Whisk eggs, milk, sugar and vanilla and pour over berries.', 'Set ramekins in a water bath and bake for thirty minutes until gently set.'],
  },
  {
    id: 'coffee-chocolate-truffles', title: 'Coffee Chocolate Truffles', description: 'Rich chocolate truffles with a coffee note.', prep: 20, cook: 5,
    ingredients: [['dark chocolate', 200, 'g'], ['cream', 100, 'ml'], ['instant coffee', 1, 'tsp'], ['cocoa powder', 2, 'tbsp']],
    instructions: ['Warm cream with coffee and pour over chopped chocolate.', 'Stir until smooth and refrigerate for two hours until firm.', 'Roll small portions into balls and coat with cocoa powder.'],
  },
  {
    id: 'honey-roasted-plums', title: 'Honey Roasted Plums', description: 'Roasted plums with honey and cool yogurt.', prep: 8, cook: 20,
    ingredients: [['plum', 6, 'piece'], ['honey', 2, 'tbsp'], ['cinnamon', 1, 'tsp'], ['yogurt', 200, 'g']],
    instructions: ['Halve plums, remove stones and place in a baking dish.', 'Drizzle with honey, dust with cinnamon and roast at 190 C for twenty minutes.', 'Let cool slightly and serve with yogurt.'], extra: 'Breakfast',
  },
]);
