import type { FactionId, Player, PlayerId, PlayerView, TechId, UnitTypeId } from '../engine';

export type AiLevel = 'easy' | 'normal' | 'hard' | 'adaptive';

// Public facts about another player: nothing a person could not read off the scoreboard.
export interface Rival { id: PlayerId; faction: FactionId; alive: boolean; turnsTaken: number }

// Everything the AI may know when it plays. Built only by aiInputFor.
export interface AiInput {
  me: PlayerId;
  self: Player;              // own record: gold, techs, explored, alive, turnsTaken
  rivals: Rival[];           // every other player, public facts only
  stamp: number;             // public: the turn counter both players see
  radius: number;
  view: PlayerView;
}

// The three fixed difficulty levels as positions on the skill dial.
export const LEVEL_DIAL: Record<Exclude<AiLevel, 'adaptive'>, number> = { easy: 0.2, normal: 0.5, hard: 0.85 };

// Concrete planning settings. Built only by skillFor.
export interface Skill {
  topK: number;          // choose among this many best actions
  temperature: number;   // softmax temperature over their scores, in value points
  margin: number;        // never choose an action more than this many points below the best
  lookahead: number;     // follow-up actions examined for each of the best candidates
  danger: number;        // weight on expected losses next turn
  focus: number;         // weight on hitting a target already hurt this turn
  economy: number;       // weight on income, growth and tech
  evals: number;         // work budget per plan (engine probes; a reachable() call counts 1, an applyAction 1)
}

// How a faction likes to play: scoring weights, a research preference and the army mix it aims for (mix.ts).
export interface Persona {
  formation: number;     // per bond between two own units (Hoplite pairs count twice), see assess.ts; below 0 spreads out
  hold: number;          // per own unit near a threatened own city; a garrison on an own city tile counts 3 times
  spread: number;        // per own city, on top of the city's value
  raid: number;          // a mounted unit that attacked and ends out of every seen enemy's reach
  forestPenalty: number; // a mounted unit ending its turn in forest
  techOrder: TechId[];   // preferred research order, before the desire for the units a tech unlocks
  mix: Partial<Record<UnitTypeId, number>>;   // target army mix, as relative shares of units; a type left out is never trained
  counter: number;       // weight on training types that answer the enemy units and cities seen
}
