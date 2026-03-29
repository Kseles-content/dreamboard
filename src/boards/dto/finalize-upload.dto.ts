import { IsOptional, IsString } from 'class-validator';

export class FinalizeUploadDto {
  @IsString()
  objectKey!: string;

  @IsOptional()
  @IsString()
  etag?: string;
}
