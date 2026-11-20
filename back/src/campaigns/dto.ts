import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
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

/** Mensagem secreta do mestre: vai só para os jogadores escolhidos e não fica guardada. */
export class WhisperDto {
  @IsArray()
  @ArrayNotEmpty({ message: 'Escolha pelo menos um jogador' })
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  userIds!: string[];

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Escreva a mensagem' })
  @MaxLength(1000)
  message!: string;
}
