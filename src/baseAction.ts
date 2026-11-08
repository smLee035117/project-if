// 기본 동작 골자
// 유저가 선택지를 고름
//
// 선택지에 따라서 판정값 획득
// 시나리오 스테이지에 따라서 판정값 분기로 점수 증감
//
// 0점이되거나, 최종 스테이지까지 0점이 아닌상태로 완수, 
// 또는 즉사하는 경우 플레이 종료


//import type { PlayState } from "./types/play.js";
import type { PlayData } from "./types/play.js";
import type { ChoiceGrade } from "./types/play.js";
import type { Scenario } from "./types/scenario.js";


//const badGrade: ChoiceGrade[] = ["BAD", "WORST", "INSTANT_DEATH"];

// const badGrade: ChoiceGrade[] = [
//   "BAD", "BAD", "BAD", "BAD", "BAD", "BAD",
//   "WORST", "WORST", "WORST",
//   "INSTANT_DEATH"
// ];
//  const randomIndex = Math.floor(Math.random() * badGrade.length);
//  const randomGrade = badGrade[randomIndex];


// 랜덤 정수
import { randomInt } from "node:crypto";

// 터미널 인터페이스
import { createInterface } from "node:readline/promises";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});


// 파일 읽기
//import { readFileSync } from "node:fs";
import { readFile } from 'node:fs/promises';


// 20스테이지 양자택일 테스트 데이터
/* function stageMake(): ChoiceGrade[][] {
    let stageArr:ChoiceGrade[][] = [];

    for(let i = 0; i < 20; i++) {
        
        //stageArr[i] = [];
        
        // GOOD 등급 선지 하나 추가
        //stageArr[i].push("GOOD");

        // BAD 이하 선지 하나 추가
        const roll = randomInt(0, 100);
        let badGrade: ChoiceGrade;

        if (roll < 60) {
        badGrade = "BAD";
        } else if (roll < 90) {
        badGrade = "WORST";
        } else {
        badGrade = "INSTANT_DEATH";
        }

        //stageArr[i].push(badGrade);
        // BAD 이하 선지 하나 추가

        // 정확히 2개의 선택지 생성
        const choices: [ChoiceGrade, ChoiceGrade] = [
            "GOOD",
            badGrade
        ];



        // 셔플
        const rollSuffle = randomInt(0, 100);
        if (rollSuffle < 50) {
            // 둘 순서 바꾸기
            [choices[0],choices[1]] = [choices[1],choices[0]];
        } else {
            // 안 바꾸기
        }

        stageArr.push(choices);
    }

    return stageArr;
} */

// 숫자 값 입력 받은 뒤 처리
function changeScore(data:PlayData, scoreVal:ChoiceGrade, totalSteps:number): void {

   




    switch(scoreVal) {
        case "BAD":
            data.score -=5;
            break;
        case "WORST":    
            data.score -=25;
            break;
                
        default:
            break;
    }

    

    // 즉사 처리
    if(scoreVal == "INSTANT_DEATH" || 0 >= data.score) {
            
        data.state = "FAILED";
        return;
    }


    //if(data.currentStep == 19) {

    //totalSteps = stages.length
    if(data.currentStep == totalSteps - 1) {
        data.state = "CLEARED";
        return;
    }

    data.currentStep+=1;

}



// null과 배열을 제외한 객체인지 확인
function isRecord(value: unknown): value is Record<string, unknown> {
    return (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
    );
}

// 비어 있지 않은 문자열인지 확인
function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

// 허용된 판정값인지 확인
function isChoiceGrade(value: unknown): value is ChoiceGrade {
    return (
        value === "GOOD" ||
        value === "BAD" ||
        value === "WORST" ||
        value === "INSTANT_DEATH"
    );
}

// 시나리오 전체 구조 검사
function validateScenario(value: unknown): asserts value is Scenario {
    if (!isRecord(value)) {
        throw new Error("시나리오는 객체여야 합니다.");
    }

    if (!isNonEmptyString(value.scenarioId)) {
        throw new Error("scenarioId는 비어 있지 않은 문자열이어야 합니다.");
    }

    if (!isNonEmptyString(value.title)) {
        throw new Error("title은 비어 있지 않은 문자열이어야 합니다.");
    }

    if (!Array.isArray(value.stages) || value.stages.length === 0) {
        throw new Error("stages는 비어 있지 않은 배열이어야 합니다.");
    }

    for (const [stageIndex, stage] of value.stages.entries()) {
        const stageLabel = `stages[${stageIndex}]`;

        if (!isRecord(stage)) {
            throw new Error(`${stageLabel}는 객체여야 합니다.`);
        }

        if (!isNonEmptyString(stage.stageId)) {
            throw new Error(`${stageLabel}.stageId가 올바르지 않습니다.`);
        }

        if (!isNonEmptyString(stage.description)) {
            throw new Error(`${stageLabel}.description이 올바르지 않습니다.`);
        }

        if (!Array.isArray(stage.choices) || stage.choices.length !== 2) {
            throw new Error(`${stageLabel}.choices는 선택지 2개를 가진 배열이어야 합니다.`);
        }

        for (const [choiceIndex, choice] of stage.choices.entries()) {
            const choiceLabel = `${stageLabel}.choices[${choiceIndex}]`;

            if (!isRecord(choice)) {
                throw new Error(`${choiceLabel}는 객체여야 합니다.`);
            }

            if (!isNonEmptyString(choice.id)) {
                throw new Error(`${choiceLabel}.id가 올바르지 않습니다.`);
            }

            if (!isNonEmptyString(choice.text)) {
                throw new Error(`${choiceLabel}.text가 올바르지 않습니다.`);
            }

            if (!isChoiceGrade(choice.grade)) {
                throw new Error(`${choiceLabel}.grade가 허용된 판정값이 아닙니다.`);
            }
        }
    }
}




// 시나리오 데이터 불러오기
export async function loadScenario(scenarioId: string): Promise<Scenario> {
    const scenarioFiles: Record<string, string> = {
        blackout_test_01: "./data/blackout_test_01.json",
        invalid_test_01: "./data/invalid_test_01.json",
    };

    // 등록된 ID인지 확인
    if (!Object.prototype.hasOwnProperty.call(scenarioFiles, scenarioId)) {
        throw new Error(`존재하지 않는 시나리오입니다: ${scenarioId}`);
    }

    const filePath = scenarioFiles[scenarioId];

    if (filePath === undefined) {
        throw new Error(`시나리오 파일 경로가 없습니다: ${scenarioId}`);
    }

    const jsonText =  await readFile(filePath, 'utf-8');

    // 아직 구조 확인되지 않은 데이터
    const scenario: unknown = JSON.parse(jsonText);

    // 실제 데이터 구조 검사
    validateScenario(scenario);

    // 요청한 ID와 파일 내부 ID가 같은지 검사
    if (scenario.scenarioId !== scenarioId) {
        throw new Error(
            `시나리오 ID가 일치하지 않습니다: 요청=${scenarioId}, 파일=${scenario.scenarioId}`
        );
    }


    return scenario;
}





// 입력함수 예시
async function testInput(scenarioId: string): Promise<void> {


    //let checkArr = stageMake();
    //console.log(checkArr);
    
    // const checkArr = readFileSync(
    //     "./data/blackout_test_01.json",
    //     "utf-8"
    // );

    //const scenario: Scenario = JSON.parse(checkArr);


    const scenario = await loadScenario(scenarioId);
    const stagesLen =  scenario.stages.length


    console.log(scenario.title);
    console.log(scenario.stages.length); // 3

    console.log(scenario);
    

    let playDATA:PlayData = {
        userId      :   10,           // 유저정보
        userType    :   0,            // 유저 타입 게스트/회원
        score       :   100,          // 점수
        state       :'PLAYING',       // 플레이 상태
        currentStep :   0,            // 현재 스테이지 인덱스(0부터 시작)
        scenarioId  :   scenarioId,  // 시나리오 종류 문자열로 등록됨
    }

    while(playDATA.state === "PLAYING") {


        //const currentStage = checkArr[playDATA.currentStep];

        const currentStage = scenario.stages[playDATA.currentStep];



        
        if (currentStage === undefined) {
            throw new Error("스테이지 데이터가 존재하지 않습니다.");


        }

        console.log(currentStage.description);
        currentStage.choices.forEach((choice, index) => {
            console.log(`${index}: ${choice.text}`);
        });



        const answer = await rl.question("0 또는 1을 선택하세요 : ");

        if (answer !== "0" && answer !== "1") {
            if(answer == "gg") {
                console.log('중도 포기합니다.');
                //stageResult = 'GIVEN_UP';

                playDATA.state = 'GIVEN_UP';

                break;
            }
            console.log("잘못된 입력입니다. 0 또는 1을 선택하세요.");
            continue;
        }

        let numAnswer = parseInt(answer);


        

        

        //const scoreVal = currentStage[numAnswer];
        const choice = currentStage.choices[numAnswer];

        if (choice === undefined) {
            console.log("선택지가 존재하지 않습니다.");
            //TODO 비정상 종료용 코드 PlayState값 추가 필요
            continue;
        }

        const scoreVal = choice.grade;

        


        console.log("입력된 값 : ", numAnswer);

        // playData 처리 로직
        //function changeScore(data:PlayData, scoreVal:ChoiceGrade):void {}
        changeScore(playDATA,scoreVal,stagesLen);

        console.log("이번 선택 결과 : ", scoreVal);
        console.log("현재 점수 : ", playDATA.score);



    }
    



    
    
    console.log(" 결과 : ", playDATA.state);


  
}

void testInput("blackout_test_01")
    .catch((error: unknown) => {
        console.error("실행 중 오류가 발생했습니다:", error);
    })
    .finally(() => {
        // 입력 인터페이스 종료
        rl.close();
    });
