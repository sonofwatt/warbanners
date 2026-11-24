// What a tile can be marked with while something is selected. A tile where one of my units can capture or claim a
// treasure glows instead (SceneTile.ready), whatever is selected: the glow is a layer under these marks.
// 'moveEnds' is a move that ends the unit's turn: a step onto or off a mountain (rules 8).
export type Mark = 'move' | 'moveEnds' | 'attack' | 'ability' | 'selected';
