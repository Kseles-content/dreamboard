import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateBoardFromTemplateDto {
  @IsString()
  @MinLength(1)
  templateId!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;
}
