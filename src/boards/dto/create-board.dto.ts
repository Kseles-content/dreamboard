import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateBoardDto {
  @IsInt()
  @Min(1)
  ownerUserId!: number;

  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;
}
