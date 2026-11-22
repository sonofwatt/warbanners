import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { CONFIG, FACTIONS, UNITS, createMatch, legalActions, statsOf, thresholdOf } from '../../engine';
import type { DeedId, MatchState, Unit } from '../../engine';
import { addCity, addUnit, blankMatch } from '../../engine/testkit';
import type { DigestLine } from '../../app/digest';
import { roundOf } from '../../app/record';
import { App } from '../App';
import { indexActions } from '../interaction';
import { T } from '../text';
import { cityCommands, techRows, unitCommands } from './commands';
import { CityPanel } from './CityPanel';
import { DigestCard } from './DigestCard';
import { Hud } from './Hud';
import { versionLine } from '../Version';
import { Menu } from './Menu';
import { RewardSheet } from './RewardSheet';
import { TechSheet } from './TechSheet';
import { TilePanel } from './TilePanel';
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

test('the Hud shows who, gold, turn and an end turn button', () => {
  const html = renderToStaticMarkup(<Hud name="Ann" colour="#c33" faction="spartans" gold={8} income={2} round={roundOf(open)} unitsToAct={1} techReady onOpenTech={noop} onOpenMenu={noop} onEndTurn={noop} onNextUnit={noop} />);
  expect(html).toContain('Ann'); expect(html).toContain('>8<'); expect(html).toContain('Turn 1'); expect(html).toContain('+2');
  expect(html).toContain('data-testid="end-turn"'); expect(html).toContain('data-testid="open-tech"'); expect(html).toContain('data-testid="tech-dot"');
  expect(html).toContain('1 unit to act');
});
test('the Hud has a Next unit button beside End turn, greyed when asked', () => {
  const hud = (nextDisabled?: boolean) => renderToStaticMarkup(
    <Hud name="Ann" colour="#c33" faction="spartans" gold={8} income={2} round={1} unitsToAct={1} techReady={false}
      nextDisabled={nextDisabled} onOpenTech={noop} onOpenMenu={noop} onEndTurn={noop} onNextUnit={noop} />);
  const button = (html: string) => /<button[^>]*data-testid="next-unit"[^>]*>/.exec(html)?.[0] ?? '';
  const html = hud();
  expect(button(html)).toContain(`aria-label="${T.ui.nextUnit}"`);
  expect(button(html)).not.toContain('disabled');
  expect(html).toContain(`>${T.ui.nextUnit}<`);
  expect(html.indexOf('data-testid="next-unit"')).toBeLessThan(html.indexOf('data-testid="end-turn"'));
  expect(html.slice(html.indexOf('class="hud-end"')).indexOf('data-testid="next-unit"')).toBeGreaterThan(0);   // in End turn's group
  expect(button(hud(true))).toContain('disabled=""');
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
test("a Mongol rider's card names the riding by territory rule; a Spartan rider's and a Mongol foot unit's do not", () => {
  const card = (type: 'horseman' | 'warrior', faction: 'mongols' | 'spartans') =>
    renderToStaticMarkup(<UnitPanel {...lone(type, faction)} commands={[]} onCommand={noop} />);
  expect(card('horseman', 'mongols')).toContain(T.ui.ridingByTerritoryBlurb);
  expect(card('horseman', 'mongols')).toContain(T.ui.ridingByTerritory);
  expect(card('horseman', 'spartans')).not.toContain(T.ui.ridingByTerritory);
  expect(card('warrior', 'mongols')).not.toContain(T.ui.ridingByTerritory);
  expect(T.trait.mounted.blurb).not.toContain('Mongol');
});
test("a Knight's card says a kill that earns a hero trait ends the chain", () => {
  const html = renderToStaticMarkup(<UnitPanel {...lone('knight', 'spartans')} commands={[]} onCommand={noop} />);
  expect(html).toContain('A kill that earns a hero trait ends the chain.');
});
test('the city panel shows growth, units and a row of units to train', () => {
  const c = open.cities[0]!;
  const html = renderToStaticMarkup(<CityPanel faction="spartans" level={c.level} growth={c.growth} growthNeeded={2} units={1} capacity={2} income={2} walls={false} commands={cityCommands(0, open, ix)} onCommand={noop} />);
  expect(html).toContain('0/2'); expect(html).toContain('1/2'); expect(html).toContain('data-testid="shop-warrior"');
  // nothing is picked yet, so no train button shows until a unit in the row is tapped
  expect(html).not.toContain('data-testid="cmd-train-warrior"');
  expect(html).toContain(T.ui.shopHint);
});
test('the tile panel names the tile', () => {
  const html = renderToStaticMarkup(<TilePanel terrain="mountain" resource="ore" building={null} road={false} commands={[]} onCommand={noop} />);
  expect(html).toContain('Mountain'); expect(html).toContain('Ore');
});
test('the tech sheet lists all twelve techs and a research button on ready ones', () => {
  const html = renderToStaticMarkup(<TechSheet rows={techRows(open, ix)} onResearch={noop} onClose={noop} />);
  for (const name of Object.values(T.tech)) expect(html).toContain(name);
  expect(html).toContain('data-testid="research-foraging"'); expect(html).not.toContain('data-testid="research-farming"');
});
test('the reward sheet shows both rewards and Later', () => {
  const html = renderToStaticMarkup(<RewardSheet level={2} onPick={noop} onLater={noop} />);
  expect(html).toContain(T.reward.gold.name); expect(html).toContain(T.reward.scout.name); expect(html).toContain('Later');
});
test('the menu offers sound, resign and home', () => {
  const html = renderToStaticMarkup(<Menu soundOn onToggleSound={noop} onResign={noop} onHome={noop} onClose={noop} />);
  expect(html).toContain('Sound on'); expect(html).toContain('data-testid="resign"'); expect(html).not.toContain('Resign this match?');
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
  const lines: DigestLine[] = Array.from({ length: 8 }, () => ({ kind: 'cityLost' }));
  const html = renderToStaticMarkup(<DigestCard lines={lines} />);
  expect(html.match(/<li>/g)).toHaveLength(6); expect(html).toContain('and 2 more');
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
