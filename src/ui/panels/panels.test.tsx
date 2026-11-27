import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { BRANCHES, CONFIG, FACTIONS, TECHS, UNITS, buildingTech, createMatch, isBraced, legalActions, statsOf, thresholdOf } from '../../engine';
import type { DeedId, MatchState, TechId, Unit } from '../../engine';
import { addCity, addUnit, blankMatch, setTile } from '../../engine/testkit';
import type { DigestLine } from '../../app/digest';
import { roundOf } from '../../app/record';
import { App } from '../App';
import { indexActions } from '../interaction';
import { T } from '../text';
import { cityCommands, techRows, tileCommands, unitCommands } from './commands';
import { CityPanel } from './CityPanel';
import { CommandList } from './CommandList';
import { DigestCard } from './DigestCard';
import { ActionBar, Hud } from './Hud';
import { versionLine } from '../Version';
import { Menu } from './Menu';
import { RewardSheet } from './RewardSheet';
import { TechSheet } from './TechSheet';
import { TilePanel, tileTitle } from './TilePanel';
import { UnitPanel } from './UnitPanel';

const open = createMatch({ seed: 7, factions: ['spartans', 'mongols'] });
const ix = indexActions(legalActions(open));
const noop = vi.fn();
const DEED_IDS: DeedId[] = ['fight', 'march', 'survive', 'rest'];

// The props a unit's card takes, built the way the match screen builds them.
function panelOf(s: MatchState, u: Unit, mine: boolean, myth = false) {
  const thresholds = mine ? Object.fromEntries(DEED_IDS.map((d) => [d, thresholdOf(s, u, d)])) as Record<DeedId, number> : null;
  return { unit: u, faction: s.players[u.owner]!.faction, stats: statsOf(s, u), myth, thresholds };
}
// A lone unit of `faction` on an empty board, for the cards that need no match around them.
function lone(type: 'horseArcher' | 'khansGuard' | 'horseman' | 'warrior' | 'knight', faction: 'mongols' | 'spartans', patch: Partial<Unit> = {}, mine = true, myth = false) {
  const s = blankMatch({ factions: faction === 'spartans' ? ['spartans', 'mongols'] : ['mongols', 'spartans'] });
  addCity(s, 0, 0, 3); addCity(s, 1, 0, -3);
  return panelOf(s, addUnit(s, type, 0, 0, 0, patch), mine, myth);
}

test('the Hud shows the Menu button first, then who, gold and turn; the turn buttons are not in it', () => {
  const html = renderToStaticMarkup(<Hud name="Ann" colour="#c33" faction="spartans" gold={8} income={2} round={roundOf(open)} onOpenMenu={noop} />);
  expect(html).toContain('Ann'); expect(html).toContain('>8<'); expect(html).toContain('Turn 1'); expect(html).toContain('+2');
  expect(html.indexOf('data-testid="open-menu"')).toBeGreaterThan(0);
  expect(html.indexOf('data-testid="open-menu"')).toBeLessThan(html.indexOf('data-testid="who"'));
  for (const id of ['end-turn', 'open-tech', 'next-unit']) expect(html).not.toContain(`data-testid="${id}"`);
});
test('the bar has Tech with its dot, Next unit with its words and count, and End turn last, greyed when asked', () => {
  const bar = (p: { nextDisabled?: boolean; unitsToAct?: number } = {}) => renderToStaticMarkup(
    <ActionBar colour="#c33" faction="spartans" unitsToAct={p.unitsToAct ?? 2} techReady nextDisabled={p.nextDisabled}
      onOpenTech={noop} onEndTurn={noop} onNextUnit={noop} />);
  const button = (html: string) => /<button[^>]*data-testid="next-unit"[^>]*>/.exec(html)?.[0] ?? '';
  const html = bar();
  expect(html).toContain('data-testid="tech-dot"');
  expect(html).toContain(`>${T.ui.techs}<`);
  expect(html).toContain(`>${T.ui.nextUnit}<`);
  expect(html).toContain('data-testid="units-to-act"');
  expect(html).toContain('2 units to act');
  expect(button(html)).not.toContain('disabled');
  expect(html.indexOf('data-testid="open-tech"')).toBeLessThan(html.indexOf('data-testid="next-unit"'));
  expect(html.indexOf('data-testid="next-unit"')).toBeLessThan(html.indexOf('data-testid="end-turn"'));
  expect(button(bar({ nextDisabled: true }))).toContain('disabled=""');
  const none = bar({ unitsToAct: 0 });
  expect(none).not.toContain('data-testid="units-to-act"');
  expect(none).toContain(T.ui.noUnitsCanAct);
});
test('the unit panel shows the card and its commands', () => {
  const u = open.units[0]!;
  const html = renderToStaticMarkup(<UnitPanel {...panelOf(open, u, true)} commands={unitCommands({ kind: 'unit', id: u.id, armed: null, askLure: null }, open, ix)} onCommand={noop} />);
  expect(html).toContain('Krypteia Scout'); expect(html).toContain('5/5');   // the Spartans' starting unit
});
test('the unit panel movement includes the Mongol mounted bonus for every mounted unit', () => {
  const move = (type: 'horseArcher' | 'khansGuard' | 'horseman', faction: 'mongols' | 'spartans') =>
    renderToStaticMarkup(<UnitPanel {...lone(type, faction)} commands={[]} onCommand={noop} />);
  const bonus = FACTIONS.mongols.mountedMoveBonus / 2;                 // half-points, shown in tiles
  expect(move('horseArcher', 'mongols')).toContain(`Movement</dt><dd>${UNITS.horseArcher.move + bonus}</dd>`);
  expect(move('khansGuard', 'mongols')).toContain(`Movement</dt><dd>${UNITS.khansGuard.move + bonus}</dd>`);
  expect(move('horseman', 'spartans')).toContain(`Movement</dt><dd>${UNITS.horseman.move}</dd>`);
});
test("a Mongol rider's card names the relay riding rule; a Spartan rider's and a Mongol foot unit's do not (rules 8)", () => {
  const card = (type: 'horseman' | 'warrior', faction: 'mongols' | 'spartans') =>
    renderToStaticMarkup(<UnitPanel {...lone(type, faction)} commands={[]} onCommand={noop} />);
  expect(card('horseman', 'mongols')).toContain(T.ui.relayRidingBlurb);
  expect(card('horseman', 'mongols')).toContain(T.ui.relayRiding);
  expect(card('horseman', 'spartans')).not.toContain(T.ui.relayRiding);
  expect(card('warrior', 'mongols')).not.toContain(T.ui.relayRiding);
  expect(T.trait.mounted.blurb).not.toContain('Mongol');
});
test("a Knight's card says momentum pays for the chain and a kill that earns a hero trait ends it", () => {
  const html = renderToStaticMarkup(<UnitPanel {...lone('knight', 'spartans')} commands={[]} onCommand={noop} />);
  expect(html).toContain('A kill costs momentum'); expect(html).toContain('as does a kill that earns a hero trait.');
});
test('the city panel shows growth, units and a row of units to train', () => {
  const c = open.cities[0]!;
  const html = renderToStaticMarkup(<CityPanel faction="spartans" level={c.level} growth={c.growth} growthNeeded={2} units={1} capacity={2} income={2} walls={false} commands={cityCommands(0, open, ix)} onCommand={noop} />);
  expect(html).toContain('0/2'); expect(html).toContain('1/2'); expect(html).toContain('data-testid="shop-warrior"');
  // nothing is picked yet, so no train button shows until a unit in the row is tapped
  expect(html).not.toContain('data-testid="cmd-train-warrior"');
  expect(html).toContain(T.ui.shopHint);
});
test('the city card: the level on the picture\'s corner, not in the row; the road badge only on a connected city', () => {
  const card = (p: { connected?: boolean; capital?: boolean }) => renderToStaticMarkup(
    <CityPanel faction="spartans" level={3} capital={p.capital} connected={p.connected} growth={1} growthNeeded={3} walls={false} commands={[]} onCommand={noop} />);
  const linked = card({ connected: true });
  expect(linked).toContain('data-testid="city-connected"');
  expect(linked).toContain(`aria-label="${T.ui.connectedToCapital}"`);
  expect(linked).toContain(`title="${T.ui.connectedToCapital}"`);
  expect(linked).toMatch(/data-testid="city-level"[^>]*aria-label="Level 3"/);
  expect(linked).not.toContain(`>${T.ui.level}<`);
  expect(linked).toContain(`>${T.ui.growth}<`);
  // Both badges sit in the picture's frame.
  const frame = linked.slice(linked.indexOf('class="picture-frame"'), linked.indexOf('class="card-title"'));
  expect(frame).toContain('city-connected'); expect(frame).toContain('city-level');
  expect(card({ connected: false })).not.toContain('city-connected');
  expect(card({})).not.toContain('city-connected');
  // A capital never shows it, whatever it is told.
  expect(card({ connected: true, capital: true })).not.toContain('city-connected');
});
test('the tile panel names the tile', () => {
  const html = renderToStaticMarkup(<TilePanel terrain="mountain" resource="ore" building={null} road={false} commands={[]} onCommand={noop} />);
  expect(html).toContain('Mountain'); expect(html).toContain('Ore');
});
test('a tile with an unclaimed village is called a Village, pictured with its huts, and keeps its real terrain', () => {
  const html = renderToStaticMarkup(<TilePanel terrain="field" resource={null} building={null} road={false} village commands={[]} onCommand={noop} />);
  const title = html.slice(html.indexOf('class="card-title"'));
  expect(title).toMatch(/^[^<]*<[^>]*>[^<]*Village/);
  // Terrain still says Field; the Building box says Village, not None.
  expect(html).toMatch(/Terrain<\/[^>]+>\s*<[^>]+>Field</);
  expect(html).toMatch(/Building<\/[^>]+>\s*<[^>]+>Village</);
  expect(html).not.toMatch(/Building<\/[^>]+>\s*<[^>]+>None</);
  // The picture draws the village (its bonfire is part of the art), not a bare field.
  const plain = renderToStaticMarkup(<TilePanel terrain="field" resource={null} building={null} road={false} commands={[]} onCommand={noop} />);
  const pic = (h: string): string => h.slice(h.indexOf('<svg class="picture"'), h.indexOf('</svg>'));
  expect(pic(html)).not.toBe(pic(plain));
  expect(pic(html)).toContain('data-bonfire');
});
test('a tile with a treasure chest is called a Treasure chest, pictured with it, and its Resource box says Chest', () => {
  const html = renderToStaticMarkup(<TilePanel terrain="forest" resource={null} building={null} road={false} treasure commands={[]} onCommand={noop} />);
  expect(tileTitle({ terrain: 'forest', building: null, treasure: true })).toBe(T.ui.treasureChest);
  expect(html).toContain(`>${T.ui.treasureChest}<`);
  expect(html).toMatch(/Terrain<\/[^>]+>\s*<[^>]+>Forest</);
  expect(html).toMatch(new RegExp(`Resource<\\/[^>]+>\\s*<[^>]+>${T.ui.chest}<`));
  expect(html).toContain('data-treasure="centre"');
});
test('a plain tile, or one with a building, is still called by its terrain', () => {
  expect(tileTitle({ terrain: 'field', building: null })).toBe('Field');
  expect(tileTitle({ terrain: 'forest', building: 'lumberCamp' })).toBe('Forest');
  expect(tileTitle({ terrain: 'field', building: null, village: false, treasure: false })).toBe('Field');
});
test('rules 8: the tile panel says a resource was harvested and can still be built on', () => {
  const html = renderToStaticMarkup(<TilePanel terrain="field" resource="orchard" building={null} road={false} harvested commands={[]} onCommand={noop} />);
  expect(html).toContain(`${T.resource.orchard} (${T.ui.harvestedTag})`); expect(html).toContain(T.ui.harvestedBlurb);
  expect(html).toContain('data-harvested="true"');
  const fresh = renderToStaticMarkup(<TilePanel terrain="mountain" resource="jewels" building={null} road={false} commands={[]} onCommand={noop} />);
  expect(fresh).toContain(T.resource.jewels); expect(fresh).not.toContain(T.ui.harvestedTag); expect(fresh).not.toContain('data-harvested');
});
test('the tech sheet lists every tech of the tree in five branches and a research button on ready ones', () => {
  const html = renderToStaticMarkup(<TechSheet rows={techRows(open, ix)} onResearch={noop} onClose={noop} />);
  for (const id of Object.keys(TECHS) as TechId[]) expect(html).toContain(`data-testid="tech-${id}"`);
  for (const b of BRANCHES) expect(html).toContain(`data-testid="branch-${b}"`);
  expect(html).not.toContain('data-testid="tech-bronze"');   // the rules 7 tree is not in play
  // a branch: its column 1 tech, then a top row and a bottom row; Waters has only column 1 for now
  expect(html).toMatch(/data-testid="branch-orchards".*tech-foraging.*class="rungs row top".*tech-defence.*tech-walls.*class="rungs row bottom".*tech-orchards.*tech-plantations/);
  expect(html).toMatch(/data-testid="branch-waters".*tech-fishing.*branch-later/);
  // the Spartans build no walls: their walls tech is Deep stores, and says what it does against a blockade
  expect(html).toMatch(/data-testid="tech-walls".*?<strong>Deep stores<\/strong>/);
  expect(html).toContain(T.ui.storesBlockade); expect(html).not.toContain(T.ui.unlocksNone);
  expect(html).toContain('data-testid="research-foraging"'); expect(html).not.toContain('data-testid="research-farming"');
});
test('a command that waits only on a tech names it and stays tappable; one short of gold does not', () => {
  const field = (Object.keys(open.tiles) as (keyof typeof open.tiles)[]).find((k) => {
    const cmds = tileCommands(k, open, ix);
    return cmds.some((c) => c.id === 'build-farm' && c.tech !== undefined);
  });
  expect(field).toBeDefined();
  const cmds = tileCommands(field!, open, ix);
  const farm = cmds.find((c) => c.id === 'build-farm')!;
  expect(farm.enabled).toBe(false); expect(farm.tech).toBe(buildingTech('farm'));
  const html = renderToStaticMarkup(<TilePanel terrain="field" resource={null} building={null} road={false} commands={cmds} onCommand={noop} />);
  const button = html.match(/<button[^>]*data-testid="cmd-build-farm"[^>]*>/)![0];
  expect(button).not.toContain('disabled'); expect(button).toContain('needs-tech');
  const broke = { ...farm, tech: undefined, why: 'Not enough gold' };
  const poor = renderToStaticMarkup(<TilePanel terrain="field" resource={null} building={null} road={false} commands={[broke]} onCommand={noop} />);
  expect(poor.match(/<button[^>]*data-testid="cmd-build-farm"[^>]*>/)![0]).toContain('disabled');
});
test('the tech sheet rings the tech it was opened for', () => {
  const html = renderToStaticMarkup(<TechSheet rows={techRows(open, ix)} focus="farming" onResearch={noop} onClose={noop} />);
  expect(html).toMatch(/class="tech [a-z]+ focus" data-testid="tech-farming"/);
  expect(html.match(/ focus"/g)).toHaveLength(1);
});
test('the reward sheet shows both rewards and Later', () => {
  const html = renderToStaticMarkup(<RewardSheet level={2} onPick={noop} onLater={noop} />);
  expect(html).toContain(T.reward.gold.name); expect(html).toContain(T.reward.scout.name); expect(html).toContain('Later');
});
test('the menu offers sound, resign and home', () => {
  const html = renderToStaticMarkup(<Menu soundOn onToggleSound={noop} onResign={noop} onHome={noop} onClose={noop} />);
  expect(html).toContain('Sound on'); expect(html).toContain('data-testid="resign"'); expect(html).not.toContain('Resign this match?');
});
test('the menu offers the 3D terrain, plainly labelled and showing whether it is on', () => {
  const line = (html: string) => /<button[^>]*data-testid="toggle-terrain3d"[^>]*>.*?<\/button>/.exec(html)?.[0] ?? '';
  const off = line(renderToStaticMarkup(<Menu soundOn onToggleSound={noop} terrain3d={false} onToggleTerrain3d={noop} onResign={noop} onHome={noop} onClose={noop} />));
  const on = line(renderToStaticMarkup(<Menu soundOn onToggleSound={noop} terrain3d onToggleTerrain3d={noop} onResign={noop} onHome={noop} onClose={noop} />));
  expect(off).toContain('aria-pressed="false"'); expect(off).toContain('3D terrain off');
  expect(on).toContain('aria-pressed="true"'); expect(on).toContain('3D terrain on');
});
test('the menu greys Resign while the AI plays', () => {
  const button = (html: string) => /<button[^>]*data-testid="resign"[^>]*>/.exec(html)?.[0] ?? '';
  expect(button(renderToStaticMarkup(<Menu soundOn onToggleSound={noop} onResign={noop} onHome={noop} onClose={noop} />))).not.toContain('disabled');
  expect(button(renderToStaticMarkup(<Menu soundOn resignDisabled onToggleSound={noop} onResign={noop} onHome={noop} onClose={noop} />))).toContain('disabled=""');
});
test('the menu shows the same version line as Home', () => {
  const menu = renderToStaticMarkup(<Menu soundOn onToggleSound={noop} onResign={noop} onHome={noop} onClose={noop} />);
  const home = renderToStaticMarkup(<App />);
  const line = versionLine();
  expect(line).toMatch(/^Version \S+ \(\S+\), rules \d+, built \S+$/);
  expect(menu).toContain(`>${line}</p>`);
  expect(home).toContain(`>${line}</footer>`);
});
test('the digest card shows six lines and counts the rest', () => {
  const lines: DigestLine[] = Array.from({ length: 8 }, () => ({ kind: 'cityLost', at: '0,0' }));
  const html = renderToStaticMarkup(<DigestCard lines={lines} />);
  expect(html.match(/<li>/g)).toHaveLength(6); expect(html.match(/data-testid="digest-line"/g)).toHaveLength(6); expect(html).toContain('and 2 more');
});
test('an own city under blockade shows the gold it will lose; one that is not shows no such line', () => {
  const html = renderToStaticMarkup(<CityPanel level={3} walls={false} income={4} blockade={2} commands={[]} onCommand={noop} />);
  expect(html).toContain(`${T.ui.blockaded}</dt><dd>${T.ui.blockadeCut(2)}`);
  const free = renderToStaticMarkup(<CityPanel level={3} walls={false} income={4} commands={[]} onCommand={noop} />);
  expect(free).not.toContain(T.ui.blockaded);
});
test('a city panel without own-city figures shows only level and walls', () => {
  const html = renderToStaticMarkup(<CityPanel level={3} walls commands={[]} onCommand={noop} />);
  expect(html).toContain(`${T.ui.level}</dt><dd>3`); expect(html).toContain(T.ui.walls);
  for (const word of [T.ui.growth, T.ui.unitsHeld, T.ui.incomeWord]) expect(html).not.toContain(word);
});

const heroOf = (traits: Unit['heroTraits'], patch: Partial<Unit> = {}) => ({ heroTraits: traits, ...patch });

test('a hero panel shows the Hero badge, earned traits and deeds with progress', () => {
  const sw = blankMatch(); addCity(sw, 0, 0, 3); addCity(sw, 1, 0, -3);
  const thr = thresholdOf(sw, addUnit(sw, 'warrior', 0, 0, 0), 'march');
  const march = thr - 1;
  const html = renderToStaticMarkup(<UnitPanel {...lone('warrior', 'spartans', heroOf(['fierce', 'hardy'], { deeds: { fight: 99, march, survive: 99, rest: 0 } }))} commands={[]} onCommand={noop} />);
  expect(html).toContain(T.ui.hero); expect(html).toContain(T.heroTrait.fierce.name); expect(html).toContain(T.heroTrait.hardy.name);
  expect(html).toContain(T.heroTrait.fierce.blurb);
  expect(html).toContain(`${march}/${thr}`);
  expect(html).toContain(T.deed.march); expect(html).toContain(T.deed.rest);
  expect(html).not.toContain(T.deed.fight); expect(html).not.toContain(T.deed.survive);   // those traits are already earned
  expect(html).toContain(`max="${thr}"`); expect(html).toContain(`value="${march}"`);
});
test('enemy panel shows traits, no deeds', () => {
  const html = renderToStaticMarkup(<UnitPanel {...lone('warrior', 'spartans', heroOf(['hardy']), false)} commands={[]} onCommand={noop} />);
  expect(html).toContain(T.heroTrait.hardy.name);
  expect(html).not.toContain('<meter'); expect(html).not.toContain(T.ui.deeds);
});
test('a Fierce unit shows its raised health', () => {
  const base = UNITS.warrior.hp;
  const html = renderToStaticMarkup(<UnitPanel {...lone('warrior', 'mongols', heroOf(['fierce'], { hp: base + CONFIG.heroes.fierceHp }))} commands={[]} onCommand={noop} />);
  expect(html).toContain(`${base + CONFIG.heroes.fierceHp}/${base + CONFIG.heroes.fierceHp}`);
});
test('a full unit shows no deed rows', () => {
  const html = renderToStaticMarkup(<UnitPanel {...lone('warrior', 'spartans', heroOf(['fierce', 'tireless', 'hardy']))} commands={[]} onCommand={noop} />);
  expect(html).not.toContain('<meter'); expect(html).not.toContain(T.ui.deeds);
  expect(html).toContain(T.ui.hero);
});
test('an ordinary unit shows no badge and no earned list', () => {
  const html = renderToStaticMarkup(<UnitPanel {...lone('warrior', 'spartans', {})} commands={[]} onCommand={noop} />);
  expect(html).not.toContain(T.ui.hero); expect(html).not.toContain(`aria-label="${T.ui.heroTraits}"`);
  expect(html.match(/<meter/g)).toHaveLength(4);
});
test('the draught line and the myth touch line', () => {
  const html = renderToStaticMarkup(<UnitPanel {...lone('warrior', 'spartans', heroOf(['fierce', 'hardy'], { item: 'draught' }), true, true)} commands={[]} onCommand={noop} />);
  expect(html).toContain(`${T.ui.carrying}: ${T.item.draught.name}`); expect(html).toContain(T.item.draught.blurb);
  expect(html).toContain(T.ui.mythTouch); expect(html).toContain(T.ui.mythTouchBlurb);
  const plain = renderToStaticMarkup(<UnitPanel {...lone('warrior', 'spartans', {})} commands={[]} onCommand={noop} />);
  expect(plain).not.toContain(T.ui.carrying); expect(plain).not.toContain(T.ui.mythTouch);
});
test('a deed bar never overfills', () => {
  const html = renderToStaticMarkup(<UnitPanel {...lone('warrior', 'mongols', { deeds: { fight: 9999, march: 0, survive: 0, rest: 0 } })} commands={[]} onCommand={noop} />);
  expect(html).toContain(`${CONFIG.heroes.thresholds.fight}/${CONFIG.heroes.thresholds.fight}`);
});
test('rules 7: a braced Hoplite shows a Braced line, any viewer; an unbraced one does not', () => {
  const s = blankMatch({ factions: ['spartans', 'mongols'] });
  const h = addUnit(s, 'hoplite', 0, 0, 0); addUnit(s, 'hoplite', 0, 1, 0);
  const html = (mine: boolean) => renderToStaticMarkup(<UnitPanel {...panelOf(s, h, mine)} braced={isBraced(s, h)} commands={[]} onCommand={noop} />);
  expect(html(true)).not.toContain(`aria-label="${T.ui.braced}"`);
  addUnit(s, 'hoplite', 0, 0, 1);
  for (const own of [true, false]) {
    expect(html(own)).toContain(`aria-label="${T.ui.braced}"`); expect(html(own)).toContain(T.ui.bracedBlurb.replace(/'/g, '&#x27;'));
  }
});
test('rules 8: the hunker button and the Hunkered line say the unit heals at the end of the turn', () => {
  expect(T.ui.hunkerHint).toContain('heals at the end of this turn');
  expect(T.ui.hunkeredBlurb).toContain('heals at the end of each of its turns');
  const html = renderToStaticMarkup(<CommandList commands={[{ id: 'hunker', label: T.ui.hunker, cost: null, enabled: true, why: null, action: null, arm: null, hint: T.ui.hunkerHint }]} onCommand={noop} />);
  expect(html).toContain(`title="${T.ui.hunkerHint}"`);
});
test('rules 9: the Unhunker button is drawn pressed in, with its hint', () => {
  const html = renderToStaticMarkup(<CommandList commands={[{ id: 'unhunker', label: T.ui.unhunker, cost: null, enabled: true, why: null, action: null, arm: null, hint: T.ui.unhunkerHint, pressed: true }]} onCommand={noop} />);
  expect(html).toContain('aria-pressed="true"'); expect(html).toContain('class="pressed"'); expect(html).toContain(T.ui.unhunker);
  const plain = renderToStaticMarkup(<CommandList commands={[{ id: 'hunker', label: T.ui.hunker, cost: null, enabled: true, why: null, action: null, arm: null }]} onCommand={noop} />);
  expect(plain).not.toContain('aria-pressed'); expect(plain).not.toContain('pressed');
});
test('rules 7: a hunkered unit shows a Hunkered line, any viewer', () => {
  for (const own of [true, false]) {
    const html = renderToStaticMarkup(<UnitPanel {...lone('warrior', 'spartans', { hunkered: true }, own)} commands={[]} onCommand={noop} />);
    expect(html).toContain(`aria-label="${T.ui.hunkered}"`); expect(html).toContain(T.ui.hunkeredBlurb);
  }
  const plain = renderToStaticMarkup(<UnitPanel {...lone('warrior', 'spartans', {})} commands={[]} onCommand={noop} />);
  expect(plain).not.toContain(`aria-label="${T.ui.hunkered}"`);
});
test('rules 7: a chain unit shows its momentum left of its start, any viewer; a unit without chain shows none', () => {
  for (const own of [true, false]) {
    const html = renderToStaticMarkup(<UnitPanel {...lone('knight', 'spartans', { momentum: 5 }, own)} commands={[]} onCommand={noop} />);
    expect(html).toContain(`aria-label="${T.ui.momentum}"`); expect(html).toContain('Momentum 5 of 7');
  }
  const guard = renderToStaticMarkup(<UnitPanel {...lone('khansGuard', 'mongols', {})} commands={[]} onCommand={noop} />);
  expect(guard).toContain('Momentum 8 of 8');
  const plain = renderToStaticMarkup(<UnitPanel {...lone('warrior', 'spartans', {})} commands={[]} onCommand={noop} />);
  expect(plain).not.toContain(`aria-label="${T.ui.momentum}"`);
});
test('rules 8: a ranged unit on a mountain shows its range with the bonus; off it, or a melee unit on one, shows the plain range', () => {
  const on = (type: 'horseArcher' | 'warrior', terrain: 'mountain' | 'field') => {
    const s = blankMatch({ factions: ['mongols', 'spartans'] });
    addCity(s, 0, 0, 3); addCity(s, 1, 0, -3);
    setTile(s, 0, 0, { terrain });
    return renderToStaticMarkup(<UnitPanel {...panelOf(s, addUnit(s, type, 0, 0, 0), true)} commands={[]} onCommand={noop} />);
  };
  expect(on('horseArcher', 'mountain')).toContain('3 (mountain)');
  expect(on('horseArcher', 'field')).not.toContain('(mountain)');
  expect(on('warrior', 'mountain')).not.toContain('(mountain)');
  // a blinded Horse Archer on a mountain shows the blinded reach, as the engine uses it
  const s = blankMatch({ factions: ['mongols', 'spartans'] });
  addCity(s, 0, 0, 3); addCity(s, 1, 0, -3);
  setTile(s, 0, 0, { terrain: 'mountain' });
  const blind = renderToStaticMarkup(<UnitPanel {...panelOf(s, addUnit(s, 'horseArcher', 0, 0, 0, { blinded: true }), true)} commands={[]} onCommand={noop} />);
  expect(blind).not.toContain('(mountain)');
  expect(statsOf(s, s.units.at(-1)!).range).toBe(CONFIG.blindedReach);
});
test('rules 8: the mountain tile says what it does; a field says nothing of it', () => {
  const peak = renderToStaticMarkup(<TilePanel terrain="mountain" resource={null} building={null} road={false} commands={[]} onCommand={noop} />);
  expect(peak).toContain(T.ui.mountainBlurb.replace(/'/g, '&#x27;'));
  const flat = renderToStaticMarkup(<TilePanel terrain="field" resource={null} building={null} road={false} commands={[]} onCommand={noop} />);
  expect(flat).not.toContain('whole turn');
});
