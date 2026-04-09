import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateVersionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}
