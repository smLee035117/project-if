// 플레이 상태 타입
export type PlayState = "PLAYING" | "FAILED"  | "CLEARED"| "GIVEN_UP";

// 판정
export type ChoiceGrade =
  "GOOD" | "BAD" | "WORST" | "INSTANT_DEATH";


// 플레이 데이터
export interface PlayData {
    userId:number;              // 유저정보
    userType:number;            // 유저 타입 게스트/회원
    score:number;               // 점수
    state:PlayState;            // 플레이 상태
    currentStep:number;         // 시나리오 단계 1~20
    scenarioId:string;          // 시나리오 종류 첫 시나리오는 0
}
