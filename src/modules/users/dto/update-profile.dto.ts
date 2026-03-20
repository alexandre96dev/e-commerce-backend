import { IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @Matches(/^[\p{L}\p{N} .'-]+$/u, { message: 'Nome contem caracteres invalidos' })
  name?: string;
}
