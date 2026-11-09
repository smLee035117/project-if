import { IsString, IsNotEmpty, } from 'class-validator';

export class StartPlayDto {
  @IsString()
  @IsNotEmpty()
  scenarioId!: string;
}