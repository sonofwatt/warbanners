import type { FactionId, Player, PlayerId, PlayerView } from '../engine';

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
