// 기본 동작 골자
// 유저가 선택지를 고름
//
// 선택지에 따라서 판정값 획득
// 시나리오 스테이지에 따라서 판정값 분기로 점수 증감
//
// 0점이되거나, 최종 스테이지까지 0점이 아닌상태로 완수, 
// 또는 즉사하는 경우 플레이 종료


import type { PlayState } from "./types/play.js";
import type { ChoiceGrade } from "./types/play.js";

//const badGrade: ChoiceGrade[] = ["BAD", "WORST", "INSTANT_DEATH"];

// const badGrade: ChoiceGrade[] = [
//   "BAD", "BAD", "BAD", "BAD", "BAD", "BAD",
//   "WORST", "WORST", "WORST",
//   "INSTANT_DEATH"
// ];
//  const randomIndex = Math.floor(Math.random() * badGrade.length);
//  const randomGrade = badGrade[randomIndex];



import { randomInt } from "node:crypto";


import { createInterface } from "node:readline/promises";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});




// 20스테이지 양자택일 테스트 데이터
function stageMake(): ChoiceGrade[][] {
    let stageArr:ChoiceGrade[][] = [];

    for(let i = 0; i < 20; i++) {
        stageArr[i] = [];
        
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
            [choices[1],choices[0]] = [choices[1],choices[0]];
        } else {
            // 안 바꾸기
        }

        stageArr.push(choices);
    }

    return stageArr;
}



async function testInput(): Promise<void> {


    let checkArr = stageMake();
    //console.log(checkArr);

    let stageCnt:number = 0;

    let score = 100;

    let deathReason:string = '';

    let stageResult:PlayState = 'PLAYING';

    while(1) {

        const answer = await rl.question("0 또는 1을 선택하세요 : ");

        if (answer !== "0" && answer !== "1") {
            if(answer == "gg") {
                console.log('중도 포기합니다.');
                stageResult = 'GIVEN_UP';

                break;
            }
            console.log("잘못된 입력입니다. 0 또는 1을 선택하세요.");
            continue;
        }

        let numAnswer = parseInt(answer);


        

        const currentStage = checkArr[stageCnt];

        
        if (currentStage === undefined) {
            console.log("스테이지 데이터가 존재하지 않습니다.");
            break;
        }

        const scoreVal = currentStage[numAnswer];

        if (scoreVal === undefined) {
            console.log("선택지가 존재하지 않습니다.");
            continue;
        }

       

        switch(scoreVal) {
            case "BAD":
                score -=5;
                break;
            case "WORST":    
            score -=25;
                break;
                
            default:
                break;
        }

        console.log("입력된 값 : ", answer);
        console.log("결과 : ", scoreVal);
        console.log("현재 상태 : ", score);

        // 즉사 처리
        if(scoreVal == "INSTANT_DEATH" || 0 >= score) {
            
            if(scoreVal == "INSTANT_DEATH") deathReason = '즉사';
            else deathReason = '상태악화';

             
            break;
        }

        stageCnt+=1;


        if(stageCnt == 20) {

            break;
        }
    }
        // 입력 인터페이스 종료
        rl.close(); 

    if('PLAYING' == stageResult) {
        if('' == deathReason) {
        stageResult = 'CLEARD';
         
        } else {
        stageResult = 'FAILED';
        }
    }
    
    
    console.log(" 결과 : ", stageResult);
    if('' != deathReason) {
        console.log(" 사망 원인 : ", deathReason);
    }

  
}

void testInput();
