import type { ReactElement, ReactNode } from 'react';
import type { FactionId, HexKey } from '../../engine';
import { hexToBoard } from '../board/layout';
import { BuildingMark, CityMark, ResourceMark, Road, TerrainFeature, Treasure, Village } from './features';
import { playerColour } from './palette';
import type { Ground } from './palette';
import { Border, Highlight, TileBase, Veil } from './tiles';
import type { Mark } from './tiles';

// A development page that shows every piece of ground art at 2 pixels per
// board unit, each with a small label. Open it with ?sheet=1.

const PX = 2; // pixels per board unit
const VIEW = { x: -40, y: -44, w: 80, h: 76 };

function Cell(p: { label: string; ground: Ground; children?: ReactNode; veil?: boolean }): ReactElement {
  return (
    <figure style={{ margin: 0, textAlign: 'center' }}>
      <svg width={VIEW.w * PX} height={VIEW.h * PX} viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} style={{ display: 'block' }}>
        <TileBase ground={p.ground} />
        {p.children}
        {p.veil ? <Veil /> : null}
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

/** Seven tiles drawn back to front, to see the pieces together. */
function Scene(): ReactElement {
  const tiles: { k: HexKey; ground: Ground; art: ReactElement | null }[] = [
    { k: '0,-1', ground: 'rock', art: <TerrainFeature terrain="mountain" variant={0} /> },
    { k: '1,-1', ground: 'grass', art: <ResourceMark resource="orchard" /> },
    { k: '-1,0', ground: 'grass', art: <Village /> },
    { k: '0,0', ground: 'sand', art: <CityMark faction="spartans" colour={playerColour('spartans')} level={3} capital walls={false} pending={false} /> },
    { k: '1,0', ground: 'grass', art: <Road links={[3, 0]} /> },
    { k: '-1,1', ground: 'water', art: <TerrainFeature terrain="water" variant={0} /> },
    { k: '0,1', ground: 'grass', art: <TerrainFeature terrain="forest" variant={1} /> },
  ];
  const sorted = [...tiles].sort((a, b) => hexToBoard(a.k).y - hexToBoard(b.k).y || hexToBoard(a.k).x - hexToBoard(b.k).x);
  return (
    <svg width={180 * PX} height={150 * PX} viewBox="-90 -70 180 150" style={{ display: 'block' }}>
      {sorted.map(({ k }) => {
        const c = hexToBoard(k);
        const t = tiles.find((x) => x.k === k)!;
        return (
          <g key={`base${k}`} transform={`translate(${c.x} ${c.y})`}>
            <TileBase ground={t.ground} />
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

const MARKS: readonly Mark[] = ['move', 'attack', 'ability', 'selected', 'capture'];
const FACTIONS: readonly FactionId[] = ['spartans', 'mongols'];
const VARIANTS = [0, 1, 2] as const;

export function ArtSheet(): ReactElement {
  return (
    <main style={{ background: '#F4F1EA', color: '#2B2B2A', padding: 16, minHeight: '100dvh', boxSizing: 'border-box' }}>
      <h1 style={{ fontSize: 20, margin: '0 0 12px' }}>Banners art sheet: ground</h1>
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
        <Cell label="game in forest" ground="grass">
          <TerrainFeature terrain="forest" variant={2} />
          <ResourceMark resource="game" />
        </Cell>
        <Cell label="ore on mountain" ground="rock">
          <TerrainFeature terrain="mountain" variant={0} />
          <ResourceMark resource="ore" />
        </Cell>
      </Section>
      <Section title="Buildings">
        <Cell label="farm" ground="grass"><BuildingMark building="farm" /></Cell>
        <Cell label="lumber camp" ground="grass"><BuildingMark building="lumberCamp" /></Cell>
        <Cell label="mine" ground="rock"><BuildingMark building="mine" /></Cell>
        <Cell label="market" ground="grass"><BuildingMark building="market" /></Cell>
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
    </main>
  );
}
