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
    timelineProgress: TimelineProgressV2;
}



export type ExecuteActionResultV2 = {
    playData: PlayDataV2;
    resultText: string;
};

export type TimelineProgressV2 = {
    // eventId → 실행 예정 게임 시각
    pending: Record<string, number>;

    // 이미 처리했거나 조건 불충족으로 건너뛴 사건
    processed: string[];
};