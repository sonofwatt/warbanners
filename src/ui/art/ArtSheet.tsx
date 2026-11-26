import type { ReactElement, ReactNode } from 'react';
import { UNITS } from '../../engine';
import type { FactionId, HexKey, Terrain, Tile, UnitTypeId } from '../../engine';
import { TileArt } from '../board/Board';
import { hexToBoard } from '../board/layout';
import { FACTION_FIGURES, FIGURES } from './factionUnits';
import type { FactionFigure } from './factionUnits';
import { BuildingMark, CityMark, ResourceMark, Road, TerrainFeature, Treasure, Village } from './features';
import { playerColour } from './palette';
import type { Ground } from './palette';
import { Border, Highlight, ReadyGlow, TileBase, Veil } from './tiles';
import type { Mark } from './tiles';
import { HeroMark, ItemBadge, itemBadgeX } from './hero';
import { SHARED_FIGURES } from './units';
import { WarBanner } from './banner';
import type { SharedFigure } from './units';
import { ACCENT } from './palette';
import { ArtModeContext } from './mode';
import type { WearProps } from './units';

// A development page that shows every piece of ground art at 2 pixels per
// board unit, each with a small label. Open it with ?sheet=1.

const PX = 2; // pixels per board unit

/** A tile key for each of the board's three terrain looks (variantOf in Board.tsx). */
const VARIANT_KEYS: readonly HexKey[] = ['0,0', '1,0', '2,0'];

function tile(terrain: Terrain, o: Partial<Tile> = {}): Tile {
  return { terrain, resource: null, building: null, harvested: false, road: false, village: false, treasure: false, cityId: null, ...o };
}
const VIEW = { x: -40, y: -44, w: 80, h: 76 };

function Cell(p: { label: string; ground: Ground; children?: ReactNode; veil?: boolean; tall?: boolean }): ReactElement {
  const v = p.tall ? { ...VIEW, y: VIEW.y - 10, h: VIEW.h + 10 } : VIEW;
  return (
    <figure style={{ margin: 0, textAlign: 'center' }}>
      <svg width={v.w * PX} height={v.h * PX} viewBox={`${v.x} ${v.y} ${v.w} ${v.h}`} style={{ display: 'block' }}>
        <TileBase ground={p.ground} />
        {p.children}
        {p.veil ? <Veil><TileBase ground={p.ground} />{p.children}</Veil> : null}
      </svg>
      <figcaption style={{ fontSize: 13, color: '#5B574E', marginTop: -4 }}>{p.label}</figcaption>
    </figure>
  );
}

function Section(p: { title: string; children: ReactNode }): ReactElement {
  return (
    <section style={{ marginBottom: 20 }}>
      <h2 style={{ fontSize: 16, margin: '0 0 6px' }}>{p.title}</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 8px' }}>{p.children}</div>
    </section>
  );
}

interface SceneTile {
  k: HexKey;
  ground: Ground;
  art: ReactElement | null;
}

/** Tiles drawn back to front: every tile base first, then the art standing on them. */
function Board(p: { tiles: readonly SceneTile[]; view: string; w: number; h: number }): ReactElement {
  const sorted = [...p.tiles].sort((a, b) => hexToBoard(a.k).y - hexToBoard(b.k).y || hexToBoard(a.k).x - hexToBoard(b.k).x);
  return (
    <svg width={p.w * PX} height={p.h * PX} viewBox={p.view} style={{ display: 'block', maxWidth: '100%', height: 'auto' }}>
      {sorted.map(({ k, ground }) => {
        const c = hexToBoard(k);
        return (
          <g key={`base${k}`} transform={`translate(${c.x} ${c.y})`}>
            <TileBase ground={ground} />
          </g>
        );
      })}
      {sorted.map(({ k, art }) => {
        const c = hexToBoard(k);
        return (
          <g key={`art${k}`} transform={`translate(${c.x} ${c.y})`}>
            {art}
          </g>
        );
      })}
    </svg>
  );
}

/** Seven tiles drawn back to front, to see the pieces together. */
function Scene(): ReactElement {
  const tiles: SceneTile[] = [
    { k: '0,-1', ground: 'rock', art: <TerrainFeature terrain="mountain" variant={0} /> },
    { k: '1,-1', ground: 'grass', art: <ResourceMark resource="orchard" /> },
    { k: '-1,0', ground: 'grass', art: <Village /> },
    { k: '0,0', ground: 'sand', art: <CityMark faction="spartans" colour={playerColour('spartans')} level={3} capital walls={false} pending={false} /> },
    { k: '1,0', ground: 'grass', art: <Road links={[3, 0]} /> },
    { k: '-1,1', ground: 'water', art: <TerrainFeature terrain="water" variant={0} /> },
    { k: '0,1', ground: 'grass', art: <TerrainFeature terrain="forest" variant={1} /> },
  ];
  return <Board tiles={tiles} view="-90 -70 180 150" w={180} h={150} />;
}

/**
 * The look reference's scene drawn with the real pieces: a Spartan city in the
 * middle, a hoplite to its left, a Mongol horse archer to its right, mountain and
 * orchard behind, water and forest in front, and a tile more at each end: more
 * water, and a Mongol camp behind the archer.
 */
function Diorama(): ReactElement {
  const fig = (id: UnitTypeId, f: FactionId): ReactElement => FIGURES[id]({ colour: playerColour(f), accent: ACCENT[f] });
  const tiles: SceneTile[] = [
    { k: '0,-1', ground: 'rock', art: <TerrainFeature terrain="mountain" variant={0} /> },
    { k: '1,-1', ground: 'grass', art: <ResourceMark resource="orchard" /> },
    { k: '2,-1', ground: 'grass', art: fig('camp', 'mongols') },
    { k: '-1,0', ground: 'grass', art: fig('hoplite', 'spartans') },
    { k: '0,0', ground: 'sand', art: <CityMark faction="spartans" colour={playerColour('spartans')} level={3} capital={false} walls={false} pending={false} /> },
    { k: '1,0', ground: 'grass', art: fig('horseArcher', 'mongols') },
    { k: '-2,1', ground: 'water', art: <TerrainFeature terrain="water" variant={1} /> },
    { k: '-1,1', ground: 'water', art: <TerrainFeature terrain="water" variant={0} /> },
    { k: '0,1', ground: 'grass', art: <TerrainFeature terrain="forest" variant={1} /> },
  ];
  return <Board tiles={tiles} view="-108 -68 216 128" w={216} h={128} />;
}

const SHARED_IDS = Object.keys(SHARED_FIGURES) as SharedFigure[];
const FACTION_IDS = Object.keys(FACTION_FIGURES) as FactionFigure[];
const ALL_IDS: readonly UnitTypeId[] = [...SHARED_IDS, ...FACTION_IDS];

/** A row of tiles, each with a figure, drawn as one board so they can be compared at a glance. */
function Lineup(p: { faction: FactionId; scale: number; ids: readonly UnitTypeId[] }): ReactElement {
  const colour = playerColour(p.faction);
  const step = 56;
  const w = p.ids.length * step;
  return (
    <svg width={w * p.scale} height={84 * p.scale} viewBox={`${-step / 2} -56 ${w} 84`} style={{ display: 'block', maxWidth: '100%', height: 'auto' }}>
      {p.ids.map((id, i) => (
        <g key={id} transform={`translate(${i * step} 0)`}>
          <TileBase ground="grass" />
          {FIGURES[id]({ colour, accent: ACCENT[p.faction] })}
        </g>
      ))}
    </svg>
  );
}

/** The wear stages shown for each sample figure, left to right, each with its label. */
const WEAR_STEPS: readonly (readonly [string, WearProps])[] = [
  ['clean', { stage: 0, blood: 0 }],
  ['scuffed', { stage: 1, blood: 0 }],
  ['dented', { stage: 2, blood: 0 }],
  ['battered', { stage: 3, blood: 0 }],
  ['battered + blood', { stage: 3, blood: 1 }],
  ['broken + blood', { stage: 4, blood: 1 }],
  ['broken + more blood', { stage: 4, blood: 2 }],
  ['healed after broken', { stage: 3, blood: 0, scarred: true }],
  ['scarred, wounded again', { stage: 3, blood: 1, scarred: true }],
];

/** The figures that have battle wear so far, each in the factions that field it. */
const WEAR_SAMPLES: readonly (readonly [UnitTypeId, FactionId])[] = [
  ['warrior', 'spartans'],
  ['warrior', 'mongols'],
  ['hoplite', 'spartans'],
  ['horseArcher', 'mongols'],
];

/** One figure through every wear stage, each on its own tile with a label, at `scale` pixels per unit. */
function WearRow(p: { id: UnitTypeId; faction: FactionId; scale: number; labels: boolean }): ReactElement {
  const step = 56;
  const w = WEAR_STEPS.length * step;
  const h = p.labels ? 92 : 84;
  return (
    <svg width={w * p.scale} height={h * p.scale} viewBox={`${-step / 2} -50 ${w} ${h}`} style={{ display: 'block', maxWidth: '100%', height: 'auto' }}>
      {WEAR_STEPS.map(([label, wear], i) => (
        <g key={label} transform={`translate(${i * step} 0)`}>
          <TileBase ground="grass" />
          {FIGURES[p.id]({ colour: playerColour(p.faction), accent: ACCENT[p.faction], wear })}
          {p.labels ? (
            <text x={0} y={39} textAnchor="middle" fontSize={5} fill="#2B2B2A">
              {label}
            </text>
          ) : null}
        </g>
      ))}
    </svg>
  );
}

/** Battle wear on the sample figures: plain on Bright ground, then each stage on Gritty ground, big and phone size. */
function BattleWear(): ReactElement {
  return (
    <section data-sheet="wear" style={{ marginBottom: 20 }}>
      <h2 style={{ fontSize: 16, margin: '0 0 6px' }}>Battle wear</h2>
      <div data-wear-row="bright" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 8px', marginBottom: 6 }}>
        {WEAR_SAMPLES.map(([id, f]) => (
          <Cell key={`${id}${f}`} label={`${id}, ${f}, bright`} ground="grass" tall>
            {FIGURES[id]({ colour: playerColour(f), accent: ACCENT[f] })}
          </Cell>
        ))}
      </div>
      <ArtModeContext.Provider value="gritty">
        {WEAR_SAMPLES.map(([id, f]) => (
          <div key={`${id}${f}`} data-wear-row={`${id}-${f}`} style={{ marginBottom: 6 }}>
            <div style={{ fontSize: 13, color: '#5B574E' }}>{`${id}, ${f}, gritty`}</div>
            <WearRow id={id} faction={f} scale={2.5} labels />
          </div>
        ))}
        <div data-wear-row="phone" style={{ marginTop: 10 }}>
          <div style={{ fontSize: 13, color: '#5B574E' }}>At phone size (about 1 pixel per unit): clean, scuffed, dented, battered, battered + blood, broken + blood, broken + more blood, healed after broken, scarred and wounded again</div>
          {WEAR_SAMPLES.map(([id, f]) => (
            <WearRow key={`${id}${f}`} id={id} faction={f} scale={1} labels={false} />
          ))}
        </div>
      </ArtModeContext.Provider>
    </section>
  );
}

const MARKS: readonly Mark[] = ['move', 'moveEnds', 'attack', 'ability', 'selected'];
const FACTIONS: readonly FactionId[] = ['spartans', 'mongols'];
const VARIANTS = [0, 1, 2] as const;

export function ArtSheet(): ReactElement {
  return (
    <main style={{ background: '#F4F1EA', color: '#2B2B2A', padding: 16, minHeight: '100dvh', boxSizing: 'border-box' }}>
      <h1 style={{ fontSize: 20, margin: '0 0 12px' }}>Warbanners art sheet</h1>
      <BattleWear />
      <Section title="Figures side by side">
        <Lineup faction="spartans" scale={PX} ids={SHARED_IDS} />
        <Lineup faction="mongols" scale={PX} ids={SHARED_IDS} />
        <Lineup faction="spartans" scale={PX} ids={FACTION_IDS} />
        <Lineup faction="mongols" scale={PX} ids={FACTION_IDS} />
      </Section>
      <Section title="Figures at phone size (a tile about 45 pixels wide)">
        <Lineup faction="spartans" scale={0.87} ids={ALL_IDS} />
        <Lineup faction="mongols" scale={0.87} ids={ALL_IDS} />
      </Section>
      {FACTIONS.map((f) => (
        <Section key={`fig${f}`} title={`Figures: ${f}`}>
          {ALL_IDS.map((id) => (
            <Cell key={id} label={id} ground="grass" tall>
              {FIGURES[id]({ colour: playerColour(f), accent: ACCENT[f] })}
            </Cell>
          ))}
        </Section>
      ))}
      <Section title="Status above a figure">
        {(
          [
            ['full health', { hp: 15, maxHp: 15 }],
            ['6 of 15', { hp: 6, maxHp: 15 }],
            ['1 of 10', { hp: 1, maxHp: 10 }],
            ['new', { hp: 10, maxHp: 10, fresh: true }],
            ['taunted', { hp: 20, maxHp: 20, taunted: true }],
            ['blinded', { hp: 12, maxHp: 15, blinded: true }],
            ['both, 40 health', { hp: 25, maxHp: 40, taunted: true, blinded: true }],
            ['hunkered', { hp: 7, maxHp: 10, hunkered: true }],
          ] as const
        ).map(([label, s]) => (
          <Cell key={label} label={label} ground="grass" tall>
            {SHARED_FIGURES.spearman({ colour: playerColour('spartans'), accent: ACCENT.spartans })}
            <WarBanner type="spearman" colour={playerColour('spartans')} spent={false} fresh={false} taunted={false} blinded={false} {...s} />
          </Cell>
        ))}
        <Cell label="spent (darker)" ground="grass" tall>
          <g className="unit-shade spent">{SHARED_FIGURES.archer({ colour: playerColour('mongols'), accent: ACCENT.mongols })}</g>
          <WarBanner type="archer" colour={playerColour('mongols')} hp={10} maxHp={10} spent fresh={false} taunted={false} blinded={false} />
        </Cell>
        <Cell label="hidden (own scout)" ground="grass" tall>
          {FIGURES.scout({ colour: playerColour('spartans'), accent: ACCENT.spartans })}
          <WarBanner type="scout" colour={playerColour('spartans')} hp={5} maxHp={5} spent={false} fresh={false} taunted={false} blinded={false} hidden />
        </Cell>
      </Section>
      <Section title="Heroes and treasures">
        {(
          [
            ['hero hoplite', 'hoplite', 'spartans', { hero: true }],
            ['hero horseman', 'horseman', 'mongols', { hero: true }],
            ['hero king\'s guard', 'kingsGuard', 'spartans', { hero: true }],
            ['hero khan\'s guard', 'khansGuard', 'mongols', { hero: true }],
            ['draught', 'archer', 'spartans', { item: true }],
            ['draught, new', 'warrior', 'mongols', { item: true, fresh: true }],
            ['hero, draught, new', 'defender', 'spartans', { hero: true, item: true, fresh: true }],
            ['sellsword', 'sellsword', 'spartans', {}],
            ['sellsword', 'sellsword', 'mongols', {}],
          ] as const
        ).map(([label, id, f, o]) => {
          const hp = UNITS[id].hp;
          const fresh = 'fresh' in o;
          return (
            <Cell key={`${label}${f}`} label={label} ground="grass" tall>
              {'hero' in o ? <HeroMark accent={ACCENT[f]} /> : null}
              {FIGURES[id]({ colour: playerColour(f), accent: ACCENT[f] })}
              <WarBanner type={id} colour={playerColour(f)} hero={'hero' in o} hp={hp} maxHp={hp} spent={false} fresh={fresh} taunted={false} blinded={false} />
              {'item' in o ? <g transform={`translate(${itemBadgeX(hp, fresh)} 0)`}><ItemBadge item="draught" /></g> : null}
            </Cell>
          );
        })}
      </Section>
      <Section title="Together">
        <Scene />
      </Section>
      <Section title="Ground">
        {(['grass', 'water', 'rock', 'sand', 'fog'] as const).map((g) => (
          <Cell key={g} label={g} ground={g} />
        ))}
      </Section>
      <Section title="Terrain">
        {VARIANTS.map((v) => (
          <Cell key={`f${v}`} label={`forest ${v}`} ground="grass">
            <TerrainFeature terrain="forest" variant={v} />
          </Cell>
        ))}
        {VARIANTS.map((v) => (
          <Cell key={`m${v}`} label={`mountain ${v}`} ground="rock">
            <TerrainFeature terrain="mountain" variant={v} />
          </Cell>
        ))}
        {VARIANTS.map((v) => (
          <Cell key={`w${v}`} label={`water ${v}`} ground="water">
            <TerrainFeature terrain="water" variant={v} />
          </Cell>
        ))}
      </Section>
      <Section title="Resources">
        <Cell label="orchard" ground="grass"><ResourceMark resource="orchard" /></Cell>
        <Cell label="cropland" ground="grass"><ResourceMark resource="cropland" /></Cell>
        <Cell label="game" ground="grass"><ResourceMark resource="game" /></Cell>
        <Cell label="ore" ground="rock"><ResourceMark resource="ore" /></Cell>
        <Cell label="jewels" ground="rock"><ResourceMark resource="jewels" /></Cell>
        <Cell label="fish" ground="water"><ResourceMark resource="fish" /></Cell>
        <Cell label="fruit, harvested" ground="grass"><ResourceMark resource="orchard" harvested /></Cell>
        {/* Shared tiles are drawn by the board's own TileArt, so the sheet shows what a match shows. */}
        {[0, 1, 2].map((v) => (
          <Cell key={`g${v}`} label={`game in forest ${v}`} ground="grass"><TileArt k={VARIANT_KEYS[v]!} tile={tile('forest', { resource: 'game' })} /></Cell>
        ))}
        <Cell label="ore on mountain" ground="rock"><TileArt k="0,0" tile={tile('mountain', { resource: 'ore' })} /></Cell>
      </Section>
      <Section title="Buildings">
        <Cell label="farm" ground="grass"><BuildingMark building="farm" /></Cell>
        <Cell label="lumber camp" ground="grass"><BuildingMark building="lumberCamp" /></Cell>
        {[0, 1, 2].map((v) => (
          <Cell key={`l${v}`} label={`lumber camp in forest ${v}`} ground="grass"><TileArt k={VARIANT_KEYS[v]!} tile={tile('forest', { building: 'lumberCamp' })} /></Cell>
        ))}
        <Cell label="mine" ground="rock"><BuildingMark building="mine" /></Cell>
        <Cell label="market" ground="grass"><BuildingMark building="market" /></Cell>
        <Cell label="orchard" ground="grass"><BuildingMark building="orchard" /></Cell>
        <Cell label="plantation" ground="grass"><BuildingMark building="plantation" /></Cell>
        <Cell label="lumber mill in forest" ground="grass"><TileArt k="0,0" tile={tile('forest', { building: 'lumberMill' })} /></Cell>
        <Cell label="foundry" ground="rock"><BuildingMark building="foundry" /></Cell>
        <Cell label="granary" ground="grass"><BuildingMark building="granary" /></Cell>
        <Cell label="fish on water" ground="water"><TileArt k="0,0" tile={tile('water', { resource: 'fish' })} /></Cell>
        <Cell label="jewels on mountain" ground="rock"><TileArt k="0,0" tile={tile('mountain', { resource: 'jewels' })} /></Cell>
      </Section>
      <Section title="Roads">
        <Cell label="no links" ground="grass"><Road links={[]} /></Cell>
        <Cell label="1 link" ground="grass"><Road links={[0]} /></Cell>
        <Cell label="2 links" ground="grass"><Road links={[0, 3]} /></Cell>
        <Cell label="3 links" ground="grass"><Road links={[1, 3, 5]} /></Cell>
      </Section>
      <Section title="Places">
        <Cell label="village" ground="grass"><Village /></Cell>
        <Cell label="treasure" ground="grass"><Treasure /></Cell>
        <Cell label="treasure in forest" ground="grass"><TileArt k="0,0" tile={tile('forest', { treasure: true })} /></Cell>
        <Cell label="fog" ground="fog" />
        <Cell label="veiled forest" ground="grass" veil>
          <TerrainFeature terrain="forest" variant={0} />
        </Cell>
        <Cell label="border, 3 edges" ground="grass">
          <Border edges={[0, 4, 5]} colour={playerColour('spartans').main} />
        </Cell>
      </Section>
      <Section title="Highlights">
        {MARKS.map((m) => (
          <Cell key={m} label={m} ground="grass"><Highlight mark={m} /></Cell>
        ))}
      </Section>
      <Section title="Ready glow (a capture or a treasure claim waits)">
        <Cell label="ready on grass" ground="grass"><Village /><ReadyGlow /></Cell>
        <Cell label="ready on a city" ground="sand">
          <CityMark faction="mongols" colour={playerColour('mongols')} level={2} capital={false} walls={false} pending={false} />
          <ReadyGlow />
        </Cell>
        <Cell label="ready on snow" ground="rock"><TerrainFeature terrain="mountain" variant={0} /><ReadyGlow /></Cell>
        <Cell label="ready treasure" ground="grass"><Treasure /><ReadyGlow /></Cell>
        <Cell label="ready and selected" ground="sand">
          <CityMark faction="spartans" colour={playerColour('spartans')} level={1} capital={false} walls={false} pending={false} />
          <ReadyGlow /><Highlight mark="selected" />
        </Cell>
        <Cell label="ready and attack" ground="grass"><ReadyGlow /><Highlight mark="attack" /></Cell>
      </Section>
      {FACTIONS.map((f) => {
        const city = (o: { level: number; capital?: boolean; walls?: boolean; pending?: boolean }): ReactElement => (
          <CityMark faction={f} colour={playerColour(f)} level={o.level} capital={!!o.capital} walls={!!o.walls} pending={!!o.pending} />
        );
        return (
          <Section key={f} title={`Cities: ${f}`}>
            {[1, 3, 5].map((level) => (
              <Cell key={level} label={`level ${level}`} ground="sand">{city({ level })}</Cell>
            ))}
            <Cell label="capital" ground="sand">{city({ level: 3, capital: true })}</Cell>
            <Cell label="walls" ground="sand">{city({ level: 3, walls: true })}</Cell>
            <Cell label="pending" ground="sand">{city({ level: 3, pending: true })}</Cell>
          </Section>
        );
      })}
      <Section title="The look reference, drawn with the real pieces">
        <Diorama />
      </Section>
    </main>
  );
}
