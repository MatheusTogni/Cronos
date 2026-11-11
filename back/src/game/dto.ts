import { Transform } from 'class-transformer';
import { ConditionPolarity } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export const ROLL_MODES = ['auto', 'manual', 'none'] as const;
export type RollMode = (typeof ROLL_MODES)[number];

export class UseAbilityDto {
  /** auto = o sistema rola o d20; manual = o jogador digita o dado físico; none = sem dado. */
  @IsIn(ROLL_MODES)
  rollMode!: RollMode;

  @ValidateIf((o: UseAbilityDto) => o.rollMode === 'manual')
  @IsInt({ message: 'Informe o valor do d20' })
  @Min(1, { message: 'O d20 vai de 1 a 20' })
  @Max(20, { message: 'O d20 vai de 1 a 20' })
  roll?: number;

  /** Alvo em texto livre (ex.: "o guarda da ponte"). */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  target?: string;

  /** Alvo que é alguém da party (aplica condições automaticamente). */
  @IsOptional()
  @IsUUID()
  targetCharacterId?: string;

  /** Nome da criatura invocada (Reanimar). */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  summonName?: string;

  /** Qual invocação sacrificar, se houver mais de uma. */
  @IsOptional()
  @IsUUID()
  summonId?: string;
}

export class AdjustDto {
  @IsOptional() @IsInt() @Min(-9999) @Max(9999) hp?: number;
  @IsOptional() @IsInt() @Min(-9999) @Max(9999) mana?: number;
  @IsOptional() @IsInt() @Min(-99999) @Max(99999) xp?: number;
  @IsOptional() @IsInt() @Min(-99) @Max(99) level?: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  reason?: string;
}

export class UpdateCharacterDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  name?: string;

  @IsOptional() @IsInt() @Min(1) @Max(9999) hpMax?: number;
  @IsOptional() @IsInt() @Min(0) @Max(9999) manaMax?: number;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;
}

export class CreateSummonDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Dê um nome para a criatura' })
  @MaxLength(60)
  name!: string;

  @IsInt() @Min(1) @Max(9999) hpMax!: number;
}

export class UpdateSummonDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name?: string;

  @IsOptional() @IsInt() @Min(1) @Max(9999) hpMax?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class AdjustSummonDto {
  @IsInt() @Min(-9999) @Max(9999) hp!: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  reason?: string;
}

export class CreateConditionDto {
  /** Condição do catálogo (GET /conditions). Sem ela, o nome é obrigatório. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  defId?: string;

  @ValidateIf((o: CreateConditionDto) => !o.defId)
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Dê um nome para a condição' })
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsEnum(ConditionPolarity)
  polarity?: ConditionPolarity;

  /** Turnos de quem carrega; sem valor = padrão do catálogo (ou sem prazo). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  turns?: number;

  /** Vida aplicada no fim de cada turno (negativo = dano). */
  @IsOptional()
  @IsInt()
  @Min(-999)
  @Max(999)
  hpPerTurn?: number;

  @IsOptional()
  @IsBoolean()
  skipsTurn?: boolean;
}

export class CreateItemDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Dê um nome para o item' })
  @MaxLength(80)
  name!: string;

  @IsOptional() @IsInt() @Min(1) @Max(9999) qty?: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  description?: string;
}

export class UpdateItemDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name?: string;

  @IsOptional() @IsInt() @Min(0) @Max(9999) qty?: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  description?: string;
}

export const DICE = [4, 6, 8, 10, 12, 20, 100] as const;

export class RollDto {
  @IsOptional()
  @IsIn(DICE)
  sides?: number;

  /** Valor de um dado físico; sem ele o sistema rola. */
  @IsOptional()
  @IsInt()
  @Min(1)
  value?: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  label?: string;
}

export class NoteDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Escreva alguma coisa' })
  @MaxLength(500)
  message!: string;
}

export class NextTurnDto {
  /** Turno que a tela mostrava; se já mudou, recusa (evita passar 2×). */
  @IsOptional() @IsInt() @Min(0) round?: number;
  @IsOptional() @IsInt() @Min(0) turnIndex?: number;
}

export class TurnOrderDto {
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  characterIds!: string[];
}

export const TARGET_KINDS = ['character', 'summon', 'npc'] as const;

/** Em quem o mestre aplica o efeito pendente. */
export class ApplyPendingDto {
  @IsIn(TARGET_KINDS)
  kind!: (typeof TARGET_KINDS)[number];

  @IsUUID()
  id!: string;
}

export class CreateNpcDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Dê um nome para o inimigo' })
  @MaxLength(60)
  name!: string;

  @IsInt() @Min(1) @Max(9999) hpMax!: number;
}

export class UpdateNpcDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name?: string;

  @IsOptional() @IsInt() @Min(1) @Max(9999) hpMax?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
