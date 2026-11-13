import type { ScenarioState } from './play-v2.js';

export interface ScenarioV2 {
  schemaVersion: 2;
  scenarioId: string;
  version: string;
  title: string;
  initialSceneId: string;
  initialState: ScenarioState;
   scenes: SceneV2[];
  
}

export type SceneV2 = {
    id : string;
    description: string;
    actions: ActionV2[];

}

export type ActionV2 = {
    id: string;
    text : string;
    when: ConditionV2;
    effects: EffectV2[];
    durationMinutes: number;
    transition: TransitionV2;
}

export type ConditionV2 = {
    path: string;
    op: 'EQ';
    value: string | number | boolean;
};



export type EffectV2 = {
    type: 'SET';
    path: string;
    value: string | number | boolean;
};

export type TransitionV2 = {
    type: 'STAY';
};