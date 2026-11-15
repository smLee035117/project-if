
import type { ScenarioState } from './types/play-v2.js';
import type { TimeEventV2 } from './types/scenario-v2.js';


import {
    applyEffect,
    evaluateConditions,
} from './state-engine-v2.js';

export function advanceTimeV2(
    state: ScenarioState,
    startMinute: number,
    durationMinutes: number,
    events: TimeEventV2[] = [],
): {
    scenarioState: ScenarioState;
    endMinute: number;
} {
    if (
        !Number.isFinite(startMinute) ||
        startMinute < 0 ||
        !Number.isFinite(durationMinutes) ||
        durationMinutes < 0
    ) {
        throw new Error('시간 값이 올바르지 않습니다.');
    }

    const endMinute = startMinute + durationMinutes;

    if (!Number.isFinite(endMinute)) {
        throw new Error('종료 시각이 올바르지 않습니다.');
    }

    let nextState = structuredClone(state);



    let eventList:TimeEventV2[] = [];
    for(const event of events) {
        

        if(startMinute < event.atMinute && endMinute >= event.atMinute ){
            eventList.push(event);
        }


        
    }
    

    eventList.sort((a,b) => a.atMinute - b.atMinute);



    for(const event of eventList) {

        if(evaluateConditions(nextState, event.when)) {
            nextState = applyEffect(nextState, event.effects);
        }
    }


    return {
        scenarioState: nextState,
        endMinute,
    };
}

