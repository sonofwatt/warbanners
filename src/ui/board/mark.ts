// What a tile can be marked with while something is selected. A tile where one of my units can capture or claim a
// treasure glows instead (SceneTile.ready), whatever is selected: the glow is a layer under these marks.
export type Mark = 'move' | 'attack' | 'ability' | 'selected';
