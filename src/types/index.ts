/**
 * Core domain types for the StormReady challenge.
 * Kept framework-agnostic so the game logic stays easy to test and reuse.
 */

/** The kind of storm a player prepares for. Each stresses different preparations. */
export type StormType = 'flood' | 'cyclone' | 'hail' | 'heatwave';

/** A grouping used to visually organise preparation tasks. */
export type PrepCategory = 'outdoor' | 'home' | 'supplies' | 'people';

/** A single preparation action a player can complete to raise their score. */
export interface PrepTask {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly category: PrepCategory;
  /** Relative weight of this task towards the resilience score. */
  readonly points: number;
}

/** A playable storm scenario: a themed set of tasks and a countdown. */
export interface Scenario {
  readonly id: string;
  readonly type: StormType;
  readonly name: string;
  readonly tagline: string;
  readonly emoji: string;
  /** How long the player has, in seconds, before the storm hits. */
  readonly durationSeconds: number;
  readonly tasks: readonly PrepTask[];
}

/** Where the player currently is in the game flow. */
export type ChallengePhase = 'picking' | 'preparing' | 'results';

/** A letter grade summarising how prepared the player was. */
export type ResilienceGrade = 'A' | 'B' | 'C' | 'D';

/** The computed result shown on the recap screen once the storm hits. */
export interface StormOutcome {
  readonly score: number;
  readonly grade: ResilienceGrade;
  /** Percentage of potential damage the preparation prevented (0-100). */
  readonly damagePrevented: number;
  readonly headline: string;
  readonly message: string;
  readonly badges: readonly string[];
}
