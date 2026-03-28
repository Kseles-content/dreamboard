import { IsInt, IsString, Max, Min } from 'class-validator';

export class CreateUploadIntentDto {
  @IsString()
  mimeType!: string;

  @IsInt()
  @Min(1)
  @Max(10 * 1024 * 1024)
  sizeBytes!: number;

  @IsString()
  fileName!: string;
}
