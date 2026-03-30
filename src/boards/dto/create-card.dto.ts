import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateCardDto {
  @IsOptional()
  @IsIn(['text', 'image'])
  type?: 'text' | 'image';

  @IsOptional()
  @IsString()
  @MinLength(1)
  text?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  objectKey?: string;
}
