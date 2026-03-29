import { IsString, MinLength } from 'class-validator';

export class UpdateCardDto {
  @IsString()
  @MinLength(1)
  text!: string;
}
