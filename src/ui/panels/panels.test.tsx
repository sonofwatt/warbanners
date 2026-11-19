import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { FACTIONS, UNITS, createMatch, legalActions } from '../../engine';
import type { DigestLine } from '../../app/digest';
import { roundOf } from '../../app/record';
import { indexActions } from '../interaction';
import { T } from '../text';
import { cityCommands, techRows, unitCommands } from './commands';
import { CityPanel } from './CityPanel';
import { DigestCard } from './DigestCard';
import { Hud } from './Hud';
import { Menu } from './Menu';
import { RewardSheet } from './RewardSheet';
import { TechSheet } from './TechSheet';
import { TilePanel } from './TilePanel';
import { UnitPanel } from './UnitPanel';

const open = createMatch({ seed: 7, factions: ['spartans', 'mongols'] });
const ix = indexActions(legalActions(open));
const noop = vi.fn();

test('the Hud shows who, gold, turn and an end turn button', () => {
  const html = renderToStaticMarkup(<Hud name="Ann" colour="#c33" faction="spartans" gold={8} income={2} round={roundOf(open)} unitsToAct={1} techReady onOpenTech={noop} onOpenMenu={noop} onEndTurn={noop} onNextUnit={noop} />);
  expect(html).toContain('Ann'); expect(html).toContain('>8<'); expect(html).toContain('Turn 1'); expect(html).toContain('+2');
  expect(html).toContain('data-testid="end-turn"'); expect(html).toContain('data-testid="open-tech"'); expect(html).toContain('data-testid="tech-dot"');
  expect(html).toContain('1 unit can still act');
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
  const html = renderToStaticMarkup(<UnitPanel type={u.type} hp={u.hp} faction="spartans" commands={unitCommands({ kind: 'unit', id: u.id, armed: null, askLure: null }, open, ix)} onCommand={noop} />);
  expect(html).toContain('Warrior'); expect(html).toContain('10/10');
});
test('the unit panel movement includes the Mongol mounted bonus for every mounted unit', () => {
  const move = (type: 'horseArcher' | 'khansGuard' | 'horseman', faction: 'mongols' | 'spartans') =>
    renderToStaticMarkup(<UnitPanel type={type} hp={10} faction={faction} commands={[]} onCommand={noop} />);
  const bonus = FACTIONS.mongols.mountedMoveBonus;
  expect(move('horseArcher', 'mongols')).toContain(`Movement</dt><dd>${UNITS.horseArcher.move + bonus}</dd>`);
  expect(move('khansGuard', 'mongols')).toContain(`Movement</dt><dd>${UNITS.khansGuard.move + bonus}</dd>`);
  expect(move('horseman', 'spartans')).toContain(`Movement</dt><dd>${UNITS.horseman.move}</dd>`);
});
test('the city panel shows growth, units and train commands', () => {
  const c = open.cities[0]!;
  const html = renderToStaticMarkup(<CityPanel level={c.level} growth={c.growth} growthNeeded={2} units={1} capacity={2} income={2} walls={false} commands={cityCommands(0, open, ix)} onCommand={noop} />);
  expect(html).toContain('0/2'); expect(html).toContain('1/2'); expect(html).toContain('data-testid="cmd-train-warrior"');
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
