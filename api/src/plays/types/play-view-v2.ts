
import type {
    PlayDataV2,
    ActionHistoryEntryV2,
} from './play-v2.js';

export type PlayActionViewV2 = {
    id: string;
    text: string;
    available: boolean;
};

export type PlayViewV2 = {
    scenarioId: string;
    scenarioTitle: string;
    state: PlayDataV2['state'];
    version: number;

    currentSceneId: string;
    sceneDescription: string;
    storyTimeMinutes: number;

    knownFacts: string[];
    actions: PlayActionViewV2[];

    // 종료 이후에만 공개합니다.
    actionHistory?: ActionHistoryEntryV2[];

    ending?: {
        id: string;
        title: string;
        description: string;
    };
};
