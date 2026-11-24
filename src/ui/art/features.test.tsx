import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import type { BuildingId, FactionId, Resource, Terrain } from '../../engine';
import { BuildingMark, CityMark, ResourceMark, Road, TerrainFeature, Treasure, Village } from './features';
import { playerColour } from './palette';
import { Border, Highlight, ReadyGlow, TileBase, Veil } from './tiles';
import type { Mark } from './tiles';

const html = (el: ReactElement) => renderToStaticMarkup(<svg>{el}</svg>);

test('no gradients anywhere', () => {
  const all = [
    <TerrainFeature terrain="forest" variant={0} />,
    <TerrainFeature terrain="mountain" variant={0} />,
    <Village />,
    <Treasure />,
    <CityMark faction="spartans" colour={playerColour('spartans')} level={3} capital walls={false} pending={false} />,
  ];
  for (const el of all) expect(html(el)).not.toMatch(/Gradient|filter=/);
});

test('a field has no feature and the others do', () => {
  expect(TerrainFeature({ terrain: 'field', variant: 0 })).toBeNull();
  for (const t of ['forest', 'mountain', 'water'] as const) {
    expect(html(<TerrainFeature terrain={t} variant={0} />).length).toBeGreaterThan(20);
  }
});

test('forest variants differ', () => {
  const v = [0, 1, 2].map((n) => html(<TerrainFeature terrain="forest" variant={n} />));
  expect(new Set(v).size).toBe(3);
});

test('every resource and building has its own drawing', () => {
  const r = (['orchard', 'cropland', 'game', 'ore', 'jewels', 'fish'] as const).map((x) => html(<ResourceMark resource={x} />));
  const b = (['farm', 'lumberCamp', 'mine', 'market', 'orchard', 'plantation', 'lumberMill', 'foundry', 'granary'] as const).map((x) => html(<BuildingMark building={x} />));
  expect(new Set([...r, ...b]).size).toBe(15);
});

test('a city carries its owner colour, grows with level, and shows capital, walls and pending', () => {
  const city = (o: Partial<Parameters<typeof CityMark>[0]>) =>
    html(<CityMark faction="spartans" colour={playerColour('spartans')} level={1} capital={false} walls={false} pending={false} {...o} />);
  expect(city({})).toContain('#B3261E');
  expect(city({ colour: playerColour('mongols') })).toContain('#2D6DB5');
  expect(city({ level: 4 }).length).toBeGreaterThan(city({ level: 1 }).length);
  expect(city({ level: 9 })).toBe(city({ level: 5 }));
  expect(new Set([city({}), city({ capital: true }), city({ walls: true }), city({ pending: true }), city({ faction: 'mongols' })]).size).toBe(5);
});

test('a road reaches toward each linked neighbour', () => {
  expect(html(<Road links={[0, 3]} />)).not.toBe(html(<Road links={[1]} />));
  expect(html(<Road links={[]} />).length).toBeGreaterThan(10);
});

test('art stays inside its tile footprint', () => {
  const terrains: Terrain[] = ['field', 'forest', 'mountain', 'water'];
  const resources: Resource[] = ['orchard', 'cropland', 'game', 'ore', 'jewels', 'fish'];
  const buildings: BuildingId[] = ['farm', 'lumberCamp', 'mine', 'market', 'orchard', 'plantation', 'lumberMill', 'foundry', 'granary'];
  const marks: Mark[] = ['move', 'moveEnds', 'attack', 'ability', 'selected'];
  const factions: FactionId[] = ['spartans', 'mongols'];
  const all: ReactElement[] = [
    ...(['grass', 'water', 'rock', 'sand', 'fog'] as const).map((g) => <TileBase ground={g} />),
    <Veil><TileBase ground="grass" /></Veil>,
    ...marks.map((m) => <Highlight mark={m} />),
    <ReadyGlow />,
    <Border edges={[0, 1, 2, 3, 4, 5]} colour="#B3261E" />,
    ...terrains.flatMap((t) => [0, 1, 2].map((v) => <TerrainFeature terrain={t} variant={v} />)),
    ...resources.map((r) => <ResourceMark resource={r} />),
    ...buildings.map((b) => <BuildingMark building={b} />),
    <Road links={[]} />,
    <Road links={[0, 1, 2, 3, 4, 5]} />,
    <Village />,
    <Treasure />,
    ...factions.flatMap((f) =>
      [1, 2, 3, 4, 5, 6].map((level) => (
        <CityMark faction={f} colour={playerColour(f)} level={level} capital walls pending />
      )),
    ),
  ];
  const attr = /\s(points|x|y|cx|cy|x1|y1|x2|y2|d)="([^"]*)"/g;
  let checked = 0;
  for (const el of all) {
    const h = html(el);
    for (const m of h.matchAll(attr)) {
      const name = m[1];
      const value = m[2] ?? '';
      // A path's relative arc and curve commands carry radii and flags, so only its absolute M points are checked.
      const text = name === 'd' ? [...value.matchAll(/M\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/g)].map((p) => `${p[1]} ${p[2]}`).join(' ') : value;
      for (const n of text.match(/-?\d+(\.\d+)?/g) ?? []) {
        const v = Number(n);
        expect(v, `${name}="${value}" in ${h.slice(0, 80)}`).toBeGreaterThanOrEqual(-40);
        expect(v, `${name}="${value}"`).toBeLessThanOrEqual(40);
        checked++;
      }
    }
  }
  expect(checked).toBeGreaterThan(200);
});
