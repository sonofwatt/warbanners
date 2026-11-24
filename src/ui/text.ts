// Every word the player reads. Names are ours; blurbs are one plain sentence each and follow docs/rules/stage1-rules.md.
import { CONFIG, UNITS } from '../engine';
import type {
  AbilityId, BuildingId, DeedId, FactionId, HeroTraitId, ItemId, Resource, RewardId, TechId, Terrain, Trait,
  TreasureOutcome, UnitTypeId,
} from '../engine';
import type { DigestLine } from '../app/digest';
import type { AiLevel } from '../ai/types';

type Entry = { name: string; blurb: string };

const H = CONFIG.heroes;
const heroTrait: Record<HeroTraitId, Entry> = {
  fierce: { name: 'Fierce', blurb: `+${H.fierceAtk} attack and +${H.fierceHp} health. Earned by fighting.` },
  tireless: { name: 'Tireless', blurb: `+${H.tirelessMove} movement. Earned by marching far.` },
  hardy: { name: 'Hardy', blurb: `+${H.hardyDef} defence. Earned by being hurt and healed.` },
  watchful: { name: 'Watchful', blurb: `Sees ${H.watchfulSight} tile farther and takes ${H.agilityCut} less damage when struck back, never below 1. Earned by resting.` },
};
const deed: Record<DeedId, string> = { fight: 'Fighting', march: 'Marching', survive: 'Surviving', rest: 'Resting' };
const item: Record<ItemId, Entry> = { draught: { name: 'Battle draught', blurb: 'Drink it once to make one more attack this turn.' } };
const treasure: Record<TreasureOutcome, string> = {
  gold: 'Gold', explore: 'A lookout', unit: 'A warrior joins', relic: 'A relic', draught: 'A battle draught',
  map: 'A treasure map', mercenary: 'A sellsword joins',
};

const unit: Record<UnitTypeId, Entry> = {
  warrior: { name: 'Warrior', blurb: 'A cheap foot soldier with no special talents.' },
  spearman: { name: 'Spearman', blurb: 'A foot soldier who strikes back harder when attacked.' },
  swordsman: { name: 'Swordsman', blurb: 'A sturdy fighter who can attack twice each turn.' },
  defender: { name: 'Defender', blurb: 'A shield-bearer with a very high defence and a weak attack.' },
  archer: { name: 'Archer', blurb: 'Shoots enemies up to two tiles away and sees two tiles around.' },
  horseman: { name: 'Horseman', blurb: 'A fast rider who keeps their remaining movement after attacking.' },
  knight: { name: 'Knight', blurb: 'A strong, fast rider who gets another attack after every kill.' },
  catapult: { name: 'Catapult', blurb: 'Throws rocks three tiles, hurting the target and the enemy units beside it, but cannot attack after moving.' },
  hoplite: { name: 'Hoplite', blurb: 'A Spartan spear fighter whose defence grows with each other Hoplite beside it, up to 2.' },
  kingsGuard: { name: "King's Guard", blurb: 'The Spartan champion, a mighty fighter whose attack does not weaken as it is hurt.' },
  piper: { name: 'Piper', blurb: 'A Spartan helper who heals friends, taunts enemies and keeps friends beside it from being lured.' },
  scout: { name: 'Krypteia Scout', blurb: 'A fast, fragile Spartan who sees only the next tile, can step into the fog and is seen by enemies only from the next tile.' },
  horseArcher: { name: 'Horse Archer', blurb: 'A Mongol rider who shoots two tiles away and keeps moving after attacking.' },
  khansGuard: { name: "Khan's Guard", blurb: 'The Mongol champion, a fast rider who attacks again after every kill and strengthens riders beside it.' },
  skyCaller: { name: 'Sky Caller', blurb: 'A Mongol helper who heals friends, speeds up riders beside it and blinds enemies with a dust storm.' },
  camp: { name: 'Camp', blurb: 'A Mongol camp that cannot attack but can train one unit each turn onto a free tile beside it.' },
  sellsword: { name: 'Sellsword', blurb: `A wandering fighter for hire who joins whoever finds it, already ${heroTrait[CONFIG.treasure.mercenaryTrait].name}.` },
};

const trait: Record<Trait, Entry> = {
  steadfast: { name: 'Steadfast', blurb: 'Strikes back harder than usual when attacked.' },
  doubleStrike: { name: 'Double strike', blurb: 'Can attack twice each turn.' },
  retreat: { name: 'Retreat', blurb: 'Keeps its remaining movement after attacking.' },
  chain: { name: 'Chain', blurb: 'Each turn starts with momentum. A kill costs momentum by the kind of unit killed and gives one more attack this turn. An attack it lacks the momentum for does 1 less damage per missing point and ends the chain, as does a kill that earns a hero trait.' },
  splash: { name: 'Splash', blurb: 'Enemy units beside the target take half the damage the target takes.' },
  siege: { name: 'Siege', blurb: 'Cannot attack after moving or move after attacking, and never strikes back.' },
  mounted: { name: 'Mounted', blurb: 'Counts as a rider for the rules that mention riders.' },
  phalanx: { name: 'Phalanx', blurb: 'Gains 1 defence for each friendly Hoplite beside it, up to 2.' },
  unbowed: { name: 'Unbowed', blurb: 'Its attack is not weakened by lost health.' },
  hidden: { name: 'Hidden', blurb: 'Enemies see it only from the tile next to it.' },
  noCityCapture: { name: 'No city capture', blurb: 'Cannot capture cities. It can still capture villages.' },
  steady: { name: 'Steady', blurb: 'Friendly units beside it cannot be lured away.' },
  inspire: { name: 'Inspire', blurb: 'Friendly riders beside it have 1 more attack.' },
  camp: { name: 'Camp', blurb: 'Cannot attack, but can train units.' },
  pathfinder: { name: 'Pathfinder', blurb: 'May end a move on one unexplored tile, but its turn ends there. Other units never step into unexplored land.' },
  heal: { name: 'Heal', blurb: 'Can heal a hurt friendly unit beside it.' },
  taunt: { name: 'Taunt', blurb: 'Can force an enemy within 2 tiles to attack only Hoplites, when any are in its reach.' },
  hasten: { name: 'Hasten', blurb: 'Can give a friendly rider beside it one extra tile of movement.' },
  dustStorm: { name: 'Dust storm', blurb: 'Can blind enemies near a tile within 2, so they give their owner no vision and attack only from next door.' },
};

const ability: Record<AbilityId, Entry> = {
  heal: { name: 'Heal', blurb: `Restores ${CONFIG.abilityHeal} health to a hurt friendly unit beside it.` },
  taunt: { name: 'Taunt', blurb: 'Forces an enemy within 2 tiles to attack only Hoplites, when any are in its reach, until its owner next turn ends.' },
  hasten: { name: 'Hasten', blurb: 'Gives a friendly rider beside it one extra tile of movement this turn.' },
  dustStorm: { name: 'Dust storm', blurb: 'Blinds the enemies on and around a tile within 2, so they give no vision and attack only from next door, until their owner next turn ends.' },
};

const reward: Record<RewardId, Entry> = {
  gold: { name: 'Gold', blurb: `Take ${CONFIG.rewardGold} gold now.` },
  scout: { name: 'Scouting', blurb: `Explore every tile within ${CONFIG.rewardScoutRadius} of this city.` },
  borders: { name: 'Wider borders', blurb: `This city's territory grows to ${CONFIG.rewardBorderRadius} tiles around it.` },
  barracks: { name: 'Barracks', blurb: `This city can support ${CONFIG.rewardCapacity} more units.` },
  income: { name: 'Income', blurb: `This city earns ${CONFIG.rewardIncome} more gold every turn.` },
  growth: { name: 'Growth', blurb: `This city gains ${CONFIG.rewardGrowth} growth points now.` },
  champion: { name: 'Champion', blurb: "Your faction's champion unit appears in this city." },
  support: { name: 'Support', blurb: "Your faction's support unit appears in this city." },
};

const tech: Record<TechId, string> = {
  foraging: 'Foraging', farming: 'Farming', markets: 'Markets', riding: 'Riding', roads: 'Roads', chivalry: 'Chivalry',
  hunting: 'Hunting', forestry: 'Forestry', engineering: 'Engineering', bronze: 'Bronze', shieldwork: 'Shieldwork', smithing: 'Smithing',
};
const building: Record<BuildingId, string> = { farm: 'Farm', lumberCamp: 'Lumber camp', mine: 'Mine', market: 'Market' };
const resource: Record<Resource, string> = { orchard: 'Orchard', cropland: 'Cropland', game: 'Game', ore: 'Ore' };
const terrain: Record<Terrain, string> = { field: 'Field', forest: 'Forest', mountain: 'Mountain', water: 'Water' };
const faction: Record<FactionId, string> = { spartans: 'Spartans', mongols: 'Mongols' };

const reason: Record<string, string> = {
  'not enough gold': 'Not enough gold',
  'missing tech': 'You have not researched what this needs',
  'city is at capacity': 'This city cannot support another unit',
  'city tile is occupied': 'A unit is standing on the city',
  'cannot train that': 'Your people cannot train that',
  'not your territory': 'Not in your territory',
  'nothing to harvest': 'Nothing here to harvest',
  'already built': 'Something is already built here',
  'wrong tile': 'This does not fit on this tile',
  'city already has a market': 'This city already has a market',
  'already a road': 'There is already a road here',
  'cannot build a road there': 'A road cannot go there',
  'already walled': 'This city already has walls',
  'your faction cannot build walls': 'Your people do not build walls',
  'no city has room': 'No city has room for another unit',
  'not your city': 'This is not your city',
  'no reward pending': 'No reward is waiting',
  'tile is not free': 'That tile is not free',
  'tile is not next to the camp': 'That tile is not next to the camp',
  'camp was trained this turn': 'The camp is too new to train',
  'camp already used this turn': 'The camp has already acted this turn',
  'already hunkered': 'This unit is already hunkered',
  'siege engines cannot hunker': 'Siege engines cannot hunker',
  'unit already acted this turn': 'This unit has already acted this turn',
};

const ui = {
  appName: 'Warbanners', rulesWord: 'rules', versionWord: 'Version', builtWord: 'built',
  walls: 'Walls', road: 'Road', harvest: 'Harvest', build: 'Build', train: 'Train', capture: 'Capture', claimTreasure: 'Claim treasure',
  attack: 'Attack', attackLure: 'Attack and lure', cancel: 'Cancel', needs: 'Needs',
  turn: 'Turn', endTurn: 'End turn', nextUnit: 'Next unit', techs: 'Tech', menu: 'Menu', gold: 'Gold', incomeWord: 'Income',
  unitsCanAct: '{n} units to act', oneUnitCanAct: '1 unit to act', noUnitsCanAct: 'No units to act',
  health: 'Health', attackStat: 'Attack', defence: 'Defence', movement: 'Movement', range: 'Range', traits: 'Traits',
  cityTitle: 'City', capitalTitle: 'Capital', techTitle: 'Technologies',
  level: 'Level', growth: 'Growth', unitsHeld: 'Units', walled: 'Walled', notWalled: 'No walls', yes: 'Yes', no: 'No',
  terrain: 'Terrain', resourceWord: 'Resource', buildingWord: 'Building', roadWord: 'Road', none: 'None',
  statusOwned: 'Known', statusReady: 'Ready', statusCostly: 'Too costly now', statusLocked: 'Locked',
  research: 'Research', unlocks: 'Opens', close: 'Close', later: 'Later', chooseReward: 'Choose a reward',
  soundOn: 'Sound on', soundOff: 'Sound off', resign: 'Resign', resignAsk: 'Resign this match?', resignYes: 'Yes, resign', resignNo: 'Keep playing',
  home: 'Back to home', andMore: 'and {n} more',
  digestLost: 'Your {unit} was lost.', digestLostBy: 'Your {unit} was lost to a {by}.',
  digestHurt: 'Your {unit} took {n} damage.', digestHurtBy: 'Your {unit} took {n} damage from a {by}.',
  digestCity: 'You lost a city.',
  digestTileTaken: 'The {by} moved into its place.', digestTreasure: 'The enemy claimed a treasure.',
  offlineReady: 'Ready to play offline.',
  updateReady: 'A new version is ready.', updateButton: 'Update',
  installButton: 'Install', installIphone: 'Tap Share, then Add to Home Screen.',
  saveFailed: 'This match could not be saved. Deleting old matches on the home screen makes room.',
  saveRepaired: 'A damaged save was repaired from the last good copy.',
  saveDropped: 'Your oldest unfinished match was removed to make room for a new one.',
  saveUnreadable: 'A saved match could not be read.',
  saveOldVersion: 'A saved match was made with older rules and cannot be continued.',
  oldVersion: 'This match was made with older rules. You can look at it but not continue it.',
  newMatch: 'New match', savedMatches: 'Saved matches', noSaves: 'No saved matches yet.',
  versusLine: '{a} ({fa}) against {b} ({fb})', turnLine: 'Turn {n}, {name} to move',
  continueButton: 'Continue', seeResult: 'See result', fromOlder: 'From an older version',
  deleteButton: 'Delete', deleteAsk: 'Delete this match?', deleteYes: 'Yes, delete', deleteNo: 'Keep it',
  dismiss: 'Dismiss', gotIt: 'Got it',
  playerOne: 'Player 1', playerTwo: 'Player 2', nameLabel: 'Name for player {n}', setupTitle: 'New match',
  spartansPlay: '{name} plays Spartans', swapFactions: 'Swap factions',
  setupLine: '{first} moves first and {second} starts with {n} more gold.', firstMoves: '{first} moves first.', start: 'Start',
  turnOf: "{name}'s turn", passTo: 'Pass the phone to {name}', imName: "I'm {name}",
  wins: '{name} wins', endedOn: 'The match ended on turn {n}.',
  byResignation: 'The other player resigned.', byLastCity: 'The last city was taken.', homeButton: 'Home',
  tagline: 'Face a friend or the AI, here or online.',
  installHint: 'Keep {name} on your home screen.',
  movesFirst: 'Moves first',
  digestTitle: 'While you were away', backToReport: 'Back to report',
  screenFailed: 'Something went wrong on this screen. Your saved matches are safe.',
  blockedUnseen: 'Something unseen blocks the way.',
  aiPassed: 'The AI could not decide and passed its turn.',
  needsConnection: 'Online play needs a connection. Solo and pass-the-phone games work without one.',
  notSetUp: 'Online play is not set up in this build.',
  serverOutOfDate: 'Online play needs a server update before new matches can start. Try again later.',
  roomGone: 'That match is no longer on the server.',
  updateDuringOnline: 'Your match with {name} is still going. If this update changes the rules, that match cannot continue. Update now?',
  onlineListDropped: 'Your oldest unfinished online match was taken off this list to make room. It is still on the server.',
  onlineListFailed: 'This phone could not keep a note of this online match. The match itself is safe on the server.',
  resignLost: 'Your resignation did not reach the other phone in time, so the match goes on.',
  playOnline: 'Play online', joinWithCode: 'Join with a code', onlineMatches: 'Online matches',
  onlineTitle: 'Play online', yourName: 'Your name', yourFaction: 'Your side',
  clockLabel: 'Turn clock', clockOff: 'Off', clockMinutes: '{n} min',
  createRoom: 'Open a lobby', roomCode: 'Room code', shareInvite: 'Send the invite', inviteText: 'Join my Warbanners match',
  copied: 'Link copied', waitingForGuest: 'Waiting for the second player to join', waitingForHost: 'Waiting for {name} to start',
  startOnline: 'Start the match', codeLabel: 'Room code', joinButton: 'Join',
  noSuchRoom: 'There is no match with that code. Check it and try again.',
  roomFull: 'That match already has two players.',
  areYou: 'This match is being played by {a} and {b}. Are you one of them?',
  newerVersion: 'This match uses rules {theirs}, and this phone has rules {mine}. Update the game to join it.',
  newerBuild: 'This match was made by a newer version of the game. Update the game to join it.',
  goUpdate: 'Update the game',
  olderVersion: 'This match uses rules {theirs}, and this phone has rules {mine}. It cannot be continued on this version.',
  theirTurn: "{name}'s turn", yourTurn: 'Your turn', yourTurnWaits: 'Your turn, once online', yourTurnWaitsShort: 'Offline', connecting: 'Connecting',
  reconnecting: 'No connection. Your match is safe and will carry on when you are back online.',
  dropped: '{name} has lost their connection. The clock is paused.',
  droppedWaiting: '{name} has lost their connection.',
  droppedNoClock: '{name} has lost their connection. The match will wait for them.',
  clockPaused: 'Paused', timeUp: 'Time ran out, so the turn ended.',
  checking: 'Checking the match against the server. One moment.',
  desyncWaits: 'Nobody can move or resign until both phones agree.',
  sending: 'Sending... Keep the game open until this line goes.',
  desync: 'Your phones disagree about the match, so it is paused. Make sure both phones have the latest version, then reopen the match.',
  onlineWith: 'Online with {name}', homeWaits: 'The match will wait for you.',
  updateDuringLobby: 'You have an online lobby open. If this update changes the rules, its match cannot be played. Update now?',
  copyFailed: 'The link could not be sent from here. Read the room code out to the other player instead.',
  // Ours, beyond the plan's list: every refusal the session can report gets a sentence, and Home's online rows a few words.
  roomStarted: 'That match has already started.',
  joinRefused: 'The server did not let this phone in. Try again in a moment.',
  rulesDiffer: 'This match uses different rules from this phone. Update the game, then try again.',
  openFailed: 'This match could not be opened. Go back and try again in a moment.',
  recordUnreadable: 'This match is too long or too damaged for this version of the game to read. Its moves are kept on the server; an update may open it.',
  onlineLobby: 'Online, waiting for a second player',
  forgetButton: 'Remove', forgetAsk: 'Take this match off this phone?', forgetYes: 'Yes, remove',
  clockShort: 'Turn clock: {clock}', seatOpen: 'Open seat', youTag: 'You',
  secondPlayer: 'Second player', person: 'Person',
  hero: 'Hero', heroTraits: 'Earned', deeds: 'Deeds', carrying: 'Carrying', drink: 'Drink draught',
  mythTouch: 'Myth touch', mythTouchBlurb: `Beside another Spartan hero: +${H.mythAtk} attack and +${H.mythDef} defence.`,
  digestTrait: 'Your {unit} earned {trait}.', digestHero: 'Your {unit} is now a hero.',
  whatsNewLabel: 'What is new',
  trainUnits: 'Units to train',
  shopHint: 'Tap a unit to see it and train it.',
  whatsNew: `New: Archers, Horse Archers and Catapults on a mountain shoot ${CONFIG.mountain.rangeBonus} tile farther, a little softer at the farthest tile. Climbing onto or off a mountain now uses up the whole turn, so no move crosses one.`,
  ridingByTerritory: 'Rides by territory',
  ridingByTerritoryBlurb: 'A move that starts in Mongol or neutral land gets half a tile more, enough for one more road or Mongol tile, and each Mongol tile costs half a tile. A move that starts in enemy land is a normal move.',
  chainEnded: 'Chain ends',
  momentum: 'Momentum',
  momentumLeft: (left: number, start: number) => `Momentum ${left} of ${start}`,
  momentumSpent: (spent: number) => `-${spent} momentum`,
  momentumBlurb: 'Spent on kills: a kill gives one more attack while there is momentum to pay for it. It comes back each turn.',
  rangeOnMountain: (n: number) => `${n} (mountain)`,
  mountainBlurb: `Stepping onto or off a mountain takes a unit's whole turn. From up here Archers, Horse Archers and Catapults shoot ${CONFIG.mountain.rangeBonus} tile farther, a little softer at the farthest tile, every unit sees ${CONFIG.mountainSightBonus} tile farther, and attacks on it do less damage.`,
  hunker: 'Hunker', hunkered: 'Hunkered', braced: 'Braced',
  bracedBlurb: `Locked shields with ${CONFIG.brace.mates} or more Hoplites beside it: +${CONFIG.brace.def} defence against a Knight or Khan's Guard, and a rider pays ${CONFIG.momentum.bracedPrice} momentum to kill it.`,
  hunkeredBlurb: `Dug in: +${CONFIG.hunker.def} defence when attacked, heals ${CONFIG.hunker.restBonus} more when it rests and ${CONFIG.hunker.abilityHealBonus} more from a Heal, and still heals a little with an enemy beside it. It ends when the unit moves or acts.`,
} as const;

const ai = {
  name: { easy: 'Easy AI', normal: 'Normal AI', hard: 'Hard AI', adaptive: 'Adaptive AI' } as Record<AiLevel, string>,
  thinking: 'Thinking...',
  settled: (n: number): string => `The AI finished at level ${n} of 10.`,
};

const stats = {
  open: 'Stats', title: 'Stats', empty: 'No finished matches yet. Stats appear here after your first match ends.',
  player: 'Player', kind: 'Match', faction: 'Faction', ai: 'Computer',
  kinds: { all: 'All', computer: 'Computer', pass: 'Pass the phone', online: 'Online' },
  bothFactions: 'Both', anyAi: 'Any',
  played: 'Played', wins: 'Won', winRate: 'Win rate', streak: 'Win run now', bestStreak: 'Best win run',
  avgDealt: 'Damage a match', avgTaken: 'Damage taken a match', kills: 'Kills', deaths: 'Units lost',
  cities: 'Cities taken', heroes: 'Heroes', treasures: 'Treasures', avgRounds: 'Turns a match', favourite: 'Favourite',
  none: '-', noMatches: 'No matches with these filters.',
  recent: 'Recent matches',
  won: 'Won against {name}', lost: 'Lost against {name}',
  recentLine: '{faction}, {kind}, {turns}, {date}',
  turns: (n: number): string => (n === 1 ? '1 turn' : `${n} turns`),
  sideLine: '{name}: {dealt} damage, {kills} kills, {deaths} units lost',
  forget: 'Forget {name}', forgetAsk: 'Forget {name} and all their stats on this phone?', forgetYes: 'Yes, forget', forgetNo: 'Keep',
  usedName: 'Use the name {name}', recentNames: 'Names used before',
  tallyTitle: 'This match', tallyDealt: 'Damage dealt', tallyKills: 'Kills', tallyDeaths: 'Units lost',
  tallyCities: 'Cities taken', tallyHeroes: 'Heroes', tallyTreasures: 'Treasures',
};

export const T = { unit, trait, heroTrait, deed, item, treasure, ability, reward, tech, building, resource, terrain, faction, reason, ui, ai, stats } as {
  unit: Record<UnitTypeId, Entry>; trait: Record<Trait, Entry>; heroTrait: Record<HeroTraitId, Entry>;
  deed: Record<DeedId, string>; item: Record<ItemId, Entry>; treasure: Record<TreasureOutcome, string>; ability: Record<AbilityId, Entry>;
  reward: Record<RewardId, Entry>; tech: Record<TechId, string>; building: Record<BuildingId, string>;
  resource: Record<Resource, string>; terrain: Record<Terrain, string>; faction: Record<FactionId, string>;
  reason: Record<string, string>; ui: typeof ui; ai: typeof ai; stats: typeof stats;
};

export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => String(values[k] ?? m));
}

export function reasonText(why: string): string {
  return T.reason[why] ?? (why.charAt(0).toUpperCase() + why.slice(1));
}

// Names of what a tech opens, read from the unit table and the config.
export function unlocks(id: TechId): string[] {
  const out: string[] = [];
  for (const [type, def] of Object.entries(UNITS)) if (def.tech === id) out.push(T.unit[type as UnitTypeId].name);
  for (const [b, rule] of Object.entries(CONFIG.buildings)) if (rule.tech === id) out.push(T.building[b as BuildingId]);
  for (const [res, rule] of Object.entries(CONFIG.harvest)) {
    if (rule.tech === id) out.push(`${T.ui.harvest} ${T.resource[res as Resource].toLowerCase()}`);
  }
  if (CONFIG.walls.tech === id) out.push(T.ui.walls);
  if (CONFIG.road.tech === id) out.push(T.ui.road);
  return out;
}

export function digestText(line: DigestLine): string {
  if (line.kind === 'cityLost') return T.ui.digestCity;
  if (line.kind === 'treasureTaken') return T.ui.digestTreasure;
  if (line.kind === 'traitEarned') return fill(T.ui.digestTrait, { unit: T.unit[line.unitType].name, trait: T.heroTrait[line.trait].name });
  if (line.kind === 'heroMade') return fill(T.ui.digestHero, { unit: T.unit[line.unitType].name });
  if (line.kind === 'tileTaken') return fill(T.ui.digestTileTaken, { by: T.unit[line.by].name });
  const name = T.unit[line.unitType].name;
  const by = line.by === null ? null : T.unit[line.by].name;
  if (line.kind === 'unitLost') return by === null ? fill(T.ui.digestLost, { unit: name }) : fill(T.ui.digestLostBy, { unit: name, by });
  return by === null ? fill(T.ui.digestHurt, { unit: name, n: line.damage }) : fill(T.ui.digestHurtBy, { unit: name, n: line.damage, by });
}
