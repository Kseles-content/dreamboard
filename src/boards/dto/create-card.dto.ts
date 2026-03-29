import { IsString, MinLength } from 'class-validator';

export class CreateCardDto {
  @IsString()
  @MinLength(1)
  text!: string;
}
