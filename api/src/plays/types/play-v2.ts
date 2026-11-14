import type { PlayData } from './play.js';

export type StateValue = string | number | boolean;

export type StateMap = Record<string, StateValue>;

export interface ScenarioState {
    world: StateMap;
    player: StateMap;
    knowledge: {
        knownFacts: string[];
    };
}

export interface PlayDataV2 extends PlayData {
    currentStageId: string;
    version: number;
    scenarioVersion: string;
    storyTimeMinutes: number;
    scenarioState: ScenarioState;
    endingId?: string;
}