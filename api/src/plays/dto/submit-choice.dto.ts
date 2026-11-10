import { IsString, IsNotEmpty, } from 'class-validator';

export class SubmitChoiceDto {
  @IsString()
  @IsNotEmpty()
  choiceId!: string;

  @IsString()
  @IsNotEmpty()
  stageId!: string;
}