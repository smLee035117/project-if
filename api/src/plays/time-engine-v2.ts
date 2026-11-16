
import type { ScenarioState , TimelineProgressV2 } from './types/play-v2.js';
import type { TimeEventV2 ,TimelineEventV2 } from './types/scenario-v2.js';


import {
    applyEffect,
    evaluateConditions,
} from './state-engine-v2.js';

export function advanceTimeV2(
    state: ScenarioState,
    startMinute: number,
    durationMinutes: number,
    events: TimeEventV2[] = [],
):  {
    scenarioState: ScenarioState;
    endMinute: number;
    handledEventIds: string[];
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



    const eventList:TimeEventV2[] = [];
    const eventIds : string[] =[];
    for(const event of events) {
        

        if(startMinute < event.atMinute && endMinute >= event.atMinute ){
            eventList.push(event);
        }


        
    }
    

    eventList.sort((a,b) => a.atMinute - b.atMinute);



    for(const event of eventList) {

        eventIds.push(event.id);

        if(evaluateConditions(nextState, event.when)) {
            nextState = applyEffect(nextState, event.effects);
        }
    }


    return {
        scenarioState: nextState,
        endMinute,
        handledEventIds : eventIds,
    };
}

export function scheduleRelativeEventsV2(
    beforeState: ScenarioState,
    afterState: ScenarioState,
    currentMinute: number,
    timeline: TimelineEventV2[],
    progress: TimelineProgressV2,
): TimelineProgressV2 {


    if (!Number.isFinite(currentMinute) || currentMinute < 0) {
        throw new Error('현재 게임 시간이 올바르지 않습니다.');
    }


    const nextProgress: TimelineProgressV2 = {
        pending: { ...progress.pending },
        processed: [...progress.processed],
    };

    // 여기에 예약 처리 로직 작성
    // timeline에서 after가 존재하는 이벤트만 대상으로 합니다.
    for(const checkTimeline of timeline) {
        if(typeof checkTimeline.after === 'undefined') {
              //throw new Error('종료 시각이 올바르지 않습니다.');
            continue;
        }
        
        // pending에 이미 예약됐거나 processed에 기록된 이벤트는 건너뜁니다.
        if(Object.hasOwn(nextProgress.pending, checkTimeline.eventId) ||
            nextProgress.processed.includes(checkTimeline.eventId)) {

                continue;
        }

        if(!evaluateConditions(beforeState, checkTimeline.after.when) &&
            evaluateConditions(afterState, checkTimeline.after.when)) {
                
                nextProgress.pending[checkTimeline.eventId] = 
                    currentMinute + checkTimeline.after.delayMinutes;

        }

    }
    


    // beforeState에서 조건이 거짓이고 afterState에서 참인 경우만 예약합니다.

    // 예약 시각은 currentMinute + event.after.delayMinutes입니다.

    return nextProgress;
}



export function buildScheduledTimeEventsV2(
    timeline: TimelineEventV2[],
    progress: TimelineProgressV2,
): TimeEventV2[] {

    const events: TimeEventV2[] = [];

    for (const event of timeline) {
  
            // 절대시간 일때,
        if(typeof event.atMinute === 'number') {
            const check: TimeEventV2 = {
                id : event.eventId,
                atMinute : event.atMinute,
                when : event.when,
                effects : event.effects,
            };

            events.push(check);
            
            // 상대시간 처리
        } else {

            if(!Object.hasOwn(progress.pending,event.eventId) ||
                progress.processed.includes(event.eventId)) {
                    continue;
            }

            const check :TimeEventV2= {
                id : event.eventId,
                atMinute : progress.pending[event.eventId],
                when : [],
                effects : event.effects
            }


            events.push(check);



        }

     


    }

    return events;
}


export function completeHandledEventsV2(
    progress: TimelineProgressV2,
    handledEventIds: string[],
): TimelineProgressV2 {

    const nextProgress: TimelineProgressV2 = {
        pending: { ...progress.pending },
        processed: [...progress.processed],
    };


    for(const eventId of handledEventIds) {
        if(Object.hasOwn(nextProgress.pending,eventId)) {           
            delete nextProgress.pending[eventId];
        } 
        
        
        if(!nextProgress.processed.includes(eventId)) {
            nextProgress.processed.push(eventId);
        }

    }


    return nextProgress;
}