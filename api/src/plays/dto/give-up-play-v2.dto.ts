import {
    IsInt,
    Min,
} from 'class-validator';

export class GiveUpPlayV2Dto {
    @IsInt()
    @Min(0)
    expectedVersion!: number;
}