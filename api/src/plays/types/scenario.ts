import type { ChoiceGrade } from "./play.js";

// 선택지 하나
export type ScenarioChoice = {
    id: string;
    text: string;
    grade: ChoiceGrade;
};

// 스테이지 하나
export type ScenarioStage = {
    stageId: string;
    description: string;
    choices: ScenarioChoice[];
};

// 시나리오 전체
export type Scenario = {
    scenarioId: string;
    title: string;
    stages: ScenarioStage[];
};