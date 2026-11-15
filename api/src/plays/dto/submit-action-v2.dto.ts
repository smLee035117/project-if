import {
  IsInt,
  IsNotEmpty,
  IsString,
  Min,
} from 'class-validator';

export class SubmitActionV2Dto {
  @IsString()
  @IsNotEmpty()
  actionId!: string;

  @IsInt()
  @Min(0)
  expectedVersion!: number;
}