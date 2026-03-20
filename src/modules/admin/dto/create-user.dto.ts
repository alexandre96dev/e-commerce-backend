import { IsEmail, IsEnum, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @Matches(/^[\p{L}\p{N} .'-]+$/u, { message: 'Nome contém caracteres inválidos' })
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsEnum(['customer', 'admin'])
  @IsOptional()
  role?: 'customer' | 'admin';
}
