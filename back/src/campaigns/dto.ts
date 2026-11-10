import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateCampaignDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Dê um nome para a campanha' })
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class UpdateCampaignDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Dê um nome para a campanha' })
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class ChooseCharacterDto {
  @IsString()
  @IsNotEmpty({ message: 'Escolha uma classe' })
  classId!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Dê um nome para o personagem' })
  @MaxLength(40)
  name!: string;
}

export class ReadyDto {
  @IsBoolean()
  ready!: boolean;
}
