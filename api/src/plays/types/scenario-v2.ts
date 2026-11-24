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
   timeEvents?: TimeEventV2[];
    timeline?: TimelineEventV2[];
}


export type TimelineEventV2 =
  | {
      eventId: string;
      description: string;
      atMinute: number;
      when: ConditionV2[];
      effects: EffectV2[];
      after?: never;
    }
  | {
      eventId: string;
      description: string;
      after: {
        trigger: 'WHEN_BECOMES_TRUE';
        delayMinutes: number;
        when: ConditionV2[];
      };
      effects: EffectV2[];
      atMinute?: never;
    };



export type TimeEventV2 = {
    id: string;
    atMinute: number;
    when: ConditionV2[];
    effects: EffectV2[];
};



export type EndingV2 = {
    id : string;
    state: 'CLEARED' | 'FAILED';
    title: string;
    description: string;
    requirements : ConditionV2[];

}



export type NarrativeV2 = {
  when: ConditionV2[];
  text: string;
};

export type SceneV2 = {
  id: string;
  location?: string;
  description?: string;
  narratives?: NarrativeV2[];
  actions: ActionV2[];
};


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
export type ValueReferenceV2 =
  | {
  kind : 'STATE';
  at : 'ACTION_START' | 'ACTION_END';
  path : string;
}

 | {
    kind : 'TIME';
    at : 'ACTION_START' | 'ACTION_END';
  };

  export type ActionEvaluationContextV2 =
  {
    startState: ScenarioState;
    endState: ScenarioState;
    startMinute: number;
    endMinute: number;
  };


  export type ConditionOperatorV2 =
  'EQ' | 'NEQ' | 'GT' | 'GTE' | 'LT' | 'LTE' | 'INCLUDES';

export type ConditionV2 =
|{
    path: string;
    op: ConditionOperatorV2;
    value: string | number | boolean;
} | {

  left : ValueReferenceV2;
   op: ConditionOperatorV2;
   value :  string | number | boolean |  ValueReferenceV2;

}| {
    op: 'AND';
    conditions: ConditionV2[];
}| {
    op: 'OR';
    conditions: ConditionV2[];
}|{
   op: 'NOT';
    condition: ConditionV2;
};




export type EffectV2 =
  | {
      type: 'SET';
      path: string;
      value: string | number | boolean;
    }
  | {
      type: 'ADD';
      path: string;
      value: number;
    }
  | {
      type: 'APPEND_UNIQUE';
      path: 'knowledge.knownFacts';
      value: string;
    }
  | {
      type: 'REMOVE';
      path: 'knowledge.knownFacts';
      value: string;
    }
    | {
      type: 'SET_FROM';
      path: string;
      from: ValueReferenceV2;
    };

export type TransitionV2 =
  | { type: 'STAY' }
  | { type: 'GOTO'; sceneId: string }
  | { type: 'END'; endingId: string };