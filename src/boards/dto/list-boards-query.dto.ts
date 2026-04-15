import { Type } from 'class-transformer';
import { IsBooleanString, IsInt, IsISO8601, IsOptional, IsString, Max, Min, MaxLength } from 'class-validator';

export class ListBoardsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  cursor?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  query?: string;

  @IsOptional()
  @IsISO8601()
  updatedSince?: string;

  @IsOptional()
  @IsBooleanString()
  pinned?: string;
}
