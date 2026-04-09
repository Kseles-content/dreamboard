import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class RevokeTokenDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  tokenId!: number;
}
