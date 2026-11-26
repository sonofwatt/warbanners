import type { ReactElement, ReactNode } from 'react';
import { ACCENT, GROUND, PLAYER_COLOURS, SKIN } from './art/palette';

// The chrome's small pictures, drawn in the board's flat style: filled shapes, no gradients, no outlines but
// for thin props. Each is decorative (aria-hidden); the button or line it sits in carries the words. Shapes
// in `currentColor` take the text colour around them, so one icon reads on paper, gold and a player colour.

// Every colour the icons paint, in one place. Where a colour is the board's own it comes from the board's palette;
// the chrome's paper comes from theme.css through a CSS variable.
const PAPER = 'var(--paper)';
// The coin is the banner gold of theme.css (--gold over its side, --gold-side), with a deeper mark of its own.
const COIN = { face: 'var(--gold)', rim: 'var(--gold-side)', mark: '#E8A912' } as const;
const C = {
  white: '#FFFFFF', red: '#E0563F', star: '#FFC21A',
  leaf: '#5FA83A', leafLight: '#86C25A', stem: '#4C8A2E',
  steel: '#9AA2AC', steelLight: '#D5DAE0', wood: '#6B4A2B', leather: '#8B5A33', sole: '#5B3A22',
  brick: '#B98552', brickDark: '#946339', stone: '#9A9486', stoneDark: '#7E786B',
  wheatStalk: '#B88A2A', wheat: '#F2C440', wheatDark: '#E0AE2A',
  wall: '#F6ECD2', wallShade: '#D9CCAA', roof: '#9C6B3E',
  grassDeep: '#5F8A3A',
} as const;

function Svg({ children, className }: { children: ReactNode; className?: string }): ReactElement {
  return (
    <svg className={className === undefined ? 'icon' : `icon ${className}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

/** A gold coin standing on its own thickness, like a tile. */
export function CoinIcon(): ReactElement {
  return (
    <Svg className="coin">
      <circle cx="12" cy="13.6" r="9.4" fill={COIN.rim} />
      <circle cx="12" cy="11.4" r="9.4" fill={COIN.face} />
      <circle cx="12" cy="11.4" r="5.6" fill={COIN.mark} />
      <rect x="10.6" y="7.6" width="2.8" height="7.6" rx="1.4" fill={COIN.face} />
    </Svg>
  );
}

/** A round-bottomed flask with something green brewing: research. */
export function FlaskIcon(): ReactElement {
  return (
    <Svg>
      <rect x="8.2" y="2" width="7.6" height="3" rx="1.2" fill="currentColor" />
      <path d="M9.4 4.6h5.2v4.6l5.6 9.2a2.6 2.6 0 0 1-2.2 4H6a2.6 2.6 0 0 1-2.2-4l5.6-9.2z" fill="currentColor" />
      <path d="M7.2 15h9.6l2 3.4a1.2 1.2 0 0 1-1 1.8H6.2a1.2 1.2 0 0 1-1-1.8z" fill={C.leaf} />
      <circle cx="10.6" cy="17.4" r="1" fill={C.white} />
    </Svg>
  );
}

/** Three chunky bars. */
export function MenuIcon(): ReactElement {
  return (
    <Svg>
      <rect x="3" y="4.5" width="18" height="3.4" rx="1.7" fill="currentColor" />
      <rect x="3" y="10.3" width="18" height="3.4" rx="1.7" fill="currentColor" />
      <rect x="3" y="16.1" width="18" height="3.4" rx="1.7" fill="currentColor" />
    </Svg>
  );
}

export function SpeakerIcon({ on }: { on: boolean }): ReactElement {
  return (
    <Svg>
      <path d="M3 9.2h4l5.4-4.6v14.8L7 14.8H3z" fill="currentColor" />
      {on ? (
        <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M15.4 9.2a4 4 0 0 1 0 5.6" />
          <path d="M18 6.6a7.6 7.6 0 0 1 0 10.8" />
        </g>
      ) : (
        <g stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <path d="M15.6 9.4l5 5.2M20.6 9.4l-5 5.2" />
        </g>
      )}
    </Svg>
  );
}

/** A peak in front of a lower one: the 3D terrain option. */
export function TerrainIcon(): ReactElement {
  return (
    <Svg>
      <path d="M2.6 19.6l6.2-9.4 3.4 4.6 3.6-6.6 5.6 11.4z" fill="currentColor" />
      <path d="M15.8 8.2l1.7 3.5-1.7-1-1.6 1z" fill={`var(--icon-cut, ${PAPER})`} />
    </Svg>
  );
}

export function HomeIcon(): ReactElement {
  return (
    <Svg>
      <path d="M12 3.2l9 7.6h-2.6v9.4H5.6v-9.4H3z" fill="currentColor" />
      <rect x="10" y="14" width="4" height="6.2" rx="1" fill={`var(--icon-cut, ${PAPER})`} />
    </Svg>
  );
}

export function CloseIcon(): ReactElement {
  return (
    <Svg>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
    </Svg>
  );
}

/** A white flag on a pole: giving up. */
export function FlagIcon(): ReactElement {
  return (
    <Svg>
      <rect x="4.4" y="2.6" width="2.4" height="19" rx="1.2" fill="currentColor" />
      <path d="M6.8 4h12.4l-3 4.4 3 4.4H6.8z" fill="currentColor" />
    </Svg>
  );
}

/** An hourglass: the turn. */
export function HourglassIcon(): ReactElement {
  return (
    <Svg>
      <rect x="5" y="2.6" width="14" height="3" rx="1.4" fill="currentColor" />
      <rect x="5" y="18.4" width="14" height="3" rx="1.4" fill="currentColor" />
      <path d="M7 5.6h10c0 3.6-3 5-3.6 6.4.6 1.4 3.6 2.8 3.6 6.4H7c0-3.6 3-5 3.6-6.4C10 10.6 7 9.2 7 5.6z" fill="currentColor" opacity="0.35" />
      <path d="M9 16.4c1-1.2 2.4-1.6 3-3 .6 1.4 2 1.8 3 3z" fill="currentColor" />
    </Svg>
  );
}

/** A stopwatch: the turn clock. */
export function ClockIcon(): ReactElement {
  return (
    <Svg>
      <rect x="9.6" y="1.6" width="4.8" height="2.6" rx="1.2" fill="currentColor" />
      <circle cx="12" cy="13.4" r="8.4" fill="currentColor" />
      <circle cx="12" cy="13.4" r="6" fill={`var(--icon-cut, ${PAPER})`} />
      <path d="M12 13.4V9.4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="12" cy="13.4" r="1.6" fill="currentColor" />
    </Svg>
  );
}

/** A small arrowhead pointing down: a section that opens below (turned up by CSS when open). */
export function ChevronIcon(): ReactElement {
  return (
    <Svg className="chevron">
      <path d="M5.4 9l6.6 6.4L18.6 9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** A bold arrow to the right: on to the next player. */
export function NextIcon(): ReactElement {
  return (
    <Svg>
      <path d="M4 9.4h8.4V4.6L21 12l-8.6 7.4v-4.8H4z" fill="currentColor" />
    </Svg>
  );
}

/** A figure with a step ahead of it: on to the next unit that can act. */
export function NextUnitIcon(): ReactElement {
  return (
    <Svg>
      <circle cx="8" cy="6.6" r="3.6" fill="currentColor" />
      <path d="M3 21v-3.2a5 5 0 0 1 10 0V21a0.8 0.8 0 0 1-0.8 0.8H3.8A0.8 0.8 0 0 1 3 21z" fill="currentColor" />
      <path d="M15.4 7.4l5.2 4.6-5.2 4.6" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function CheckIcon(): ReactElement {
  return (
    <Svg>
      <path d="M5 12.4l4.4 4.4L19 7.2" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function LockIcon(): ReactElement {
  return (
    <Svg>
      <path d="M8 10.6V8a4 4 0 0 1 8 0v2.6" fill="none" stroke="currentColor" strokeWidth="2.6" />
      <rect x="5" y="10.4" width="14" height="10.6" rx="2.4" fill="currentColor" />
    </Svg>
  );
}

export function SwapIcon(): ReactElement {
  return (
    <Svg>
      <path d="M3 8.2h11.6V4.4L21 9.6l-6.4 5.2v-3.6H3z" fill="currentColor" />
      <path d="M21 15.8H9.4v3.8L3 14.4l6.4-5.2v3.6H21z" fill="currentColor" opacity="0.55" />
    </Svg>
  );
}

export function InfoIcon(): ReactElement {
  return (
    <Svg>
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <rect x="10.6" y="10.4" width="2.8" height="7.6" rx="1.4" fill={`var(--icon-cut, ${PAPER})`} />
      <circle cx="12" cy="7" r="1.7" fill={`var(--icon-cut, ${PAPER})`} />
    </Svg>
  );
}

// ---- stats: one small picture per number on a card ----

export function HeartIcon(): ReactElement {
  return <Svg><path d="M12 20.6S3 14.8 3 8.8A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 9 1.8c0 6-9 11.8-9 11.8z" fill={C.red} /></Svg>;
}
export function SwordIcon(): ReactElement {
  return (
    <Svg>
      <path d="M19.6 3l1.4 1.4-9.6 9.6-1.4-1.4z" fill={C.steel} />
      <path d="M19.6 3H21v1.4z" fill={C.steelLight} />
      <path d="M6.4 12.6l5 5-1.4 1.4-5-5z" fill={ACCENT.spartans} />
      <path d="M7.6 15l1.4 1.4-4 4-1.4-1.4z" fill={C.wood} />
    </Svg>
  );
}
export function ShieldIcon(): ReactElement {
  return (
    <Svg>
      <path d="M12 2.6l8 3v6c0 5-3.6 8.4-8 9.8-4.4-1.4-8-4.8-8-9.8v-6z" fill={PLAYER_COLOURS.mongols.main} />
      <path d="M12 2.6l8 3v6c0 5-3.6 8.4-8 9.8z" fill={PLAYER_COLOURS.mongols.dark} />
      <circle cx="12" cy="11" r="2.6" fill={ACCENT.mongols} />
    </Svg>
  );
}
export function BootIcon(): ReactElement {
  return (
    <Svg>
      <path d="M7 3h6.4v9.4l6 2.6c1 .4 1.6 1.4 1.6 2.4V20H4v-4.4c1.4-.4 3-1.2 3-3z" fill={C.leather} />
      <rect x="4" y="18" width="17" height="3" rx="1" fill={C.sole} />
    </Svg>
  );
}
export function RangeIcon(): ReactElement {
  return (
    <Svg>
      <circle cx="12" cy="12" r="9.4" fill={C.red} />
      <circle cx="12" cy="12" r="6.4" fill={C.white} />
      <circle cx="12" cy="12" r="3.4" fill={C.red} />
    </Svg>
  );
}
export function StarIcon(): ReactElement {
  return <Svg><path d="M12 2.6l2.8 5.8 6.4.8-4.7 4.4 1.2 6.3L12 16.8l-5.7 3.1 1.2-6.3-4.7-4.4 6.4-.8z" fill={C.star} /></Svg>;
}
export function SproutIcon(): ReactElement {
  return (
    <Svg>
      <path d="M11 21V11h2v10z" fill={C.stem} />
      <path d="M12 12C6 12 3.6 8.4 3.6 4.4 9.4 4.4 12 7.4 12 12z" fill={C.leaf} />
      <path d="M12 13.4c0-4.6 2.6-7.6 8.4-7.6 0 4-2.4 7.6-8.4 7.6z" fill={C.leafLight} />
    </Svg>
  );
}
export function PeopleIcon(): ReactElement {
  return (
    <Svg>
      <circle cx="8" cy="7.4" r="3.4" fill={SKIN} />
      <path d="M2.4 20v-3.4a5.6 5.6 0 0 1 11.2 0V20z" fill={PLAYER_COLOURS.spartans.main} />
      <circle cx="16.6" cy="8.4" r="3" fill={SKIN} />
      <path d="M12 20v-3a5 5 0 0 1 9.6-2V20z" fill={PLAYER_COLOURS.mongols.main} />
    </Svg>
  );
}
export function WallIcon(): ReactElement {
  return (
    <Svg>
      <path d="M3 7h3V4.4h3V7h2.4V4.4h3V7H17V4.4h3V20H3z" fill={C.brick} />
      <path d="M3 12h17v1.6H3zM8 7h1.6v5H8zm6 6.6h1.6V20H14z" fill={C.brickDark} />
    </Svg>
  );
}
export function CoinsIcon(): ReactElement {
  return (
    <Svg>
      <ellipse cx="12" cy="17" rx="8" ry="3.6" fill={COIN.rim} />
      <ellipse cx="12" cy="15" rx="8" ry="3.6" fill={COIN.face} />
      <ellipse cx="12" cy="11" rx="8" ry="3.6" fill={COIN.rim} />
      <ellipse cx="12" cy="9" rx="8" ry="3.6" fill={COIN.face} />
      <ellipse cx="12" cy="9" rx="4" ry="1.6" fill={COIN.mark} />
    </Svg>
  );
}
export function PeakIcon(): ReactElement {
  return (
    <Svg>
      <path d="M2 20L10 5l4 7 2-3 6 11z" fill={C.stone} />
      <path d="M10 5l4 7-2 8h-2z" fill={C.stoneDark} />
      <path d="M8 8.8L10 5l2 3.6-2 1.2z" fill={C.white} />
    </Svg>
  );
}
export function WheatIcon(): ReactElement {
  return (
    <Svg>
      <path d="M11.2 9h1.6v12h-1.6z" fill={C.wheatStalk} />
      {[4, 8, 12].map((y) => (
        <g key={y}>
          <ellipse cx="9.4" cy={y + 1.4} rx="2" ry="3" fill={C.wheat} />
          <ellipse cx="14.6" cy={y + 1.4} rx="2" ry="3" fill={C.wheatDark} />
        </g>
      ))}
      <ellipse cx="12" cy="3.6" rx="1.8" ry="2.8" fill={C.wheat} />
    </Svg>
  );
}
export function HutIcon(): ReactElement {
  return (
    <Svg>
      <rect x="5" y="11" width="14" height="10" fill={C.wall} />
      <rect x="15" y="11" width="4" height="10" fill={C.wallShade} />
      <path d="M2.6 12L12 3.6l9.4 8.4z" fill={C.roof} />
      <rect x="10" y="15" width="4" height="6" fill={C.wood} />
    </Svg>
  );
}
export function RoadIcon(): ReactElement {
  return (
    <Svg>
      <path d="M8.4 2h7.2l5 20H3.4z" fill={GROUND.sand[1]} />
      <path d="M11 4h2v3h-2zm-.2 6h2.4v3.4h-2.4zm-.4 6.4h3.2V20h-3.2z" fill={PAPER} />
    </Svg>
  );
}

/**
 * A swallowtail banner on a bronze pole, in the owner's colours: the game's mark and a player's badge.
 * Drawn in a 24 by 24 box like the icons.
 */
export function BannerMark({ colour, accent }: { colour: { main: string; dark: string }; accent: string }): ReactElement {
  return (
    <svg className="banner-mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="4.4" y="3" width="2.6" height="19.4" rx="1.1" fill={accent} />
      <circle cx="5.7" cy="2.8" r="2" fill={accent} />
      <path d="M7 4.6h14l-4 5.4 4 5.4H7z" fill={colour.main} />
      <path d="M7 12.4h12.2l-2.2 3H7z" fill={colour.dark} />
      <circle cx="12.6" cy="9" r="2.2" fill={accent} />
    </svg>
  );
}

/**
 * The game's emblem: the banner standing on a thick grass tile, the same drawing as the app icon
 * (public/icon.svg) without its sky, in the given player's colours.
 */
export function BannerTile({ colour, accent, className }: { colour: { main: string; dark: string }; accent: string; className?: string }): ReactElement {
  return (
    <svg className={className ?? 'banner-tile'} viewBox="56 60 400 470" aria-hidden="true" focusable="false">
      <polygon points="66,380 151,465 151,525 66,440" fill={GROUND.grass[1]} />
      <polygon points="151,465 361,465 361,525 151,525" fill={GROUND.grass[2]} />
      <polygon points="361,465 446,380 446,440 361,525" fill={C.grassDeep} />
      <polygon points="66,380 151,295 361,295 446,380 361,465 151,465" fill={GROUND.grass[0]} />
      <ellipse cx="256" cy="392" rx="62" ry="20" fill={GROUND.grass[1]} />
      <rect x="244" y="86" width="22" height="316" rx="6" fill={accent} />
      <circle cx="255" cy="76" r="22" fill={accent} />
      <polygon points="266,104 432,104 384,168 432,232 266,232" fill={colour.main} />
      <polygon points="266,196 410,196 384,232 266,232" fill={colour.dark} />
      <circle cx="330" cy="150" r="26" fill={accent} />
    </svg>
  );
}
