import type { ScenarioState } from './play-v2.js';

export interface ScenarioV2 {
  schemaVersion: 2;
  scenarioId: string;
  version: string;
  title: string;
  initialSceneId: string;
  initialState: ScenarioState;
   scenes: SceneV2[];
   endings: EndingV2[];
  
}

export type EndingV2 = {
    id : string;
    state: 'CLEARED' | 'FAILED';
    title: string;
    description: string;
    requirements : ConditionV2[];

}


export type SceneV2 = {
    id : string;
    description: string;
    actions: ActionV2[];

}

export type ActionV2 = {
    id: string;
    text : string;
    when: ConditionV2[];
    durationMinutes: number;
    outcomes : OutcomeV2[];
}

export type OutcomeV2 = {
    resultText: string;
    when: ConditionV2[];
    effects: EffectV2[];
    transition: TransitionV2;
}

export type ConditionV2 = {
    path: string;
    op: 'EQ' | 'NEQ' | 'GT' | 'GTE' | 'LT' | 'LTE' | 'INCLUDES';
    value: string | number | boolean;
};



export type EffectV2 = {
    type: 'SET';
    path: string;
    value: string | number | boolean;
};

export type TransitionV2 =
  | { type: 'STAY' }
  | { type: 'GOTO'; sceneId: string }
  | { type: 'END'; endingId: string };