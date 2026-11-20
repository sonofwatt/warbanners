import type { ReactElement } from 'react';
import type { HexKey } from '../../engine';
import { FIGURES } from '../art/factionUnits';
import { CityMark, ResourceMark, TerrainFeature } from '../art/features';
import { ACCENT, playerColour } from '../art/palette';
import type { Ground } from '../art/palette';
import { TileBase } from '../art/tiles';
import { depthOrder, hexToBoard } from '../board/layout';

// A little strip of the board at the foot of Home, built from the board's own pieces: a Spartan capital and a
// Mongol town with a soldier of each people between mountain, orchard, forest and water. Decoration only.

const SPARTANS = { colour: playerColour('spartans'), accent: ACCENT.spartans };
const MONGOLS = { colour: playerColour('mongols'), accent: ACCENT.mongols };

const TILES: readonly { k: HexKey; ground: Ground; art: () => ReactElement | null }[] = [
  { k: '-2,0', ground: 'water', art: () => <TerrainFeature terrain="water" variant={1} /> },
  { k: '-1,0', ground: 'rock', art: () => <TerrainFeature terrain="mountain" variant={0} /> },
  { k: '0,0', ground: 'sand', art: () => <CityMark faction="spartans" colour={SPARTANS.colour} level={2} capital walls={false} pending={false} /> },
  { k: '1,0', ground: 'grass', art: () => <TerrainFeature terrain="forest" variant={2} /> },
  { k: '2,0', ground: 'sand', art: () => <CityMark faction="mongols" colour={MONGOLS.colour} level={1} capital={false} walls={false} pending={false} /> },
  { k: '-2,1', ground: 'grass', art: () => FIGURES.hoplite(SPARTANS) },
  { k: '-1,1', ground: 'grass', art: () => <ResourceMark resource="orchard" /> },
  { k: '0,1', ground: 'water', art: () => <TerrainFeature terrain="water" variant={0} /> },
  { k: '1,1', ground: 'grass', art: () => FIGURES.horseArcher(MONGOLS) },
];

export function HomeScene(): ReactElement {
  const sorted = [...TILES].sort((a, b) => depthOrder(a.k, b.k));
  return (
    <svg className="home-scene" viewBox="-132 -46 264 104" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      {sorted.map(({ k, ground, art }) => {
        const c = hexToBoard(k);
        return (
          <g key={k} transform={`translate(${c.x} ${c.y})`}>
            <TileBase ground={ground} />
            {art()}
          </g>
        );
      })}
    </svg>
  );
}
