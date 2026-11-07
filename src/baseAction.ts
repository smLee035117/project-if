// 기본 동작 골자
// 유저가 선택지를 고름
//
// 선택지에 따라서 판정값 획득
// 시나리오 스테이지에 따라서 판정값 분기로 점수 증감
//
// 0점이되거나, 최종 스테이지까지 0점이 아닌상태로 완수, 
// 또는 즉사하는 경우 플레이 종료


import type { PlayState } from "./types/play.js";
import type { PlayData } from "./types/play.js";
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
}

// 숫자 값 입력 받은 뒤 처리
function changeScore(data:PlayData, scoreVal:ChoiceGrade): void {

   




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


    

    if(data.currentStep == 19) {
        data.state = "CLEARD";
        return;
    }

    data.currentStep+=1;

}


// 입력함수 예시
async function testInput(): Promise<void> {


    let checkArr = stageMake();
    //console.log(checkArr);
    



    let playDATA:PlayData = {
        userId      :   10,           // 유저정보
        userType    :   0,            // 유저 타입 게스트/회원
        score       :   100,          // 점수
        state       :'PLAYING',       // 플레이 상태
        currentStep :   0,            // 시나리오 단계 1~20
        scenarioId  :   0,            // 시나리오 종류 첫 시나리오는 0
    }

    while(playDATA.state === "PLAYING") {

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


        

        const currentStage = checkArr[playDATA.currentStep];


        
        if (currentStage === undefined) {
            console.log("스테이지 데이터가 존재하지 않습니다.");
            //TODO 비정상 종료용 코드 PlayState값 추가 필요
            break;
        }

        const scoreVal = currentStage[numAnswer];

        if (scoreVal === undefined) {
            console.log("선택지가 존재하지 않습니다.");
            //TODO 비정상 종료용 코드 PlayState값 추가 필요
            continue;
        }


        console.log("입력된 값 : ", numAnswer);

       // playData 처리 로직
       //function changeScore(data:PlayData, scoreVal:ChoiceGrade):void {}
       changeScore(playDATA,scoreVal);

       console.log("이번 선택 결과 : ", scoreVal);
        console.log("현재 점수 : ", playDATA.score);



    }
    // 입력 인터페이스 종료
    rl.close(); 


    
    
    console.log(" 결과 : ", playDATA.state);


  
}

void testInput();
