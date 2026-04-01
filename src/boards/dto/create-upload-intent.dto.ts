import { IsInt, IsString, Min } from 'class-validator';

export class CreateUploadIntentDto {
  @IsString()
  mimeType!: string;

  @IsInt()
  @Min(1)
  sizeBytes!: number;

  @IsString()
  fileName!: string;
}
