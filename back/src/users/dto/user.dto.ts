import { Role } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const trimLower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateUserDto {
  @Transform(trimLower)
  @IsString()
  @Matches(/^[a-z0-9._-]{3,30}$/, {
    message:
      'O login deve ter de 3 a 30 caracteres: letras minúsculas, números, ponto, hífen ou _',
  })
  username!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Informe o nome' })
  @MaxLength(60)
  displayName!: string;

  @IsString()
  @MinLength(4, { message: 'A senha deve ter pelo menos 4 caracteres' })
  @MaxLength(100)
  password!: string;

  @IsEnum(Role, { message: 'Papel inválido' })
  role!: Role;
}

export class UpdateUserDto {
  @IsOptional()
  @Transform(trimLower)
  @IsString()
  @Matches(/^[a-z0-9._-]{3,30}$/, {
    message:
      'O login deve ter de 3 a 30 caracteres: letras minúsculas, números, ponto, hífen ou _',
  })
  username?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Informe o nome' })
  @MaxLength(60)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MinLength(4, { message: 'A senha deve ter pelo menos 4 caracteres' })
  @MaxLength(100)
  password?: string;

  @IsOptional()
  @IsEnum(Role, { message: 'Papel inválido' })
  role?: Role;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
