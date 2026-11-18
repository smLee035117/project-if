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

export interface ActionHistoryEntryV2 {
    sequence: number;
    fromSceneId: string;
    toSceneId: string;
    actionId: string;
    actionText: string;
    resultText: string;
    startedAtMinute: number;
    endedAtMinute: number;
}

export interface PlayDataV2 extends PlayData {
    currentStageId: string;
    version: number;
    scenarioVersion: string;
    storyTimeMinutes: number;
    scenarioState: ScenarioState;
    endingId?: string;
    timelineProgress: TimelineProgressV2;

    // 기존 Redis 플레이에는 이 필드가 없을 수 있습니다.
    actionHistory?: ActionHistoryEntryV2[];
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