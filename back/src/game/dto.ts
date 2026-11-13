import { Transform } from 'class-transformer';
import { ConditionPolarity } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
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
import { SHOP_CODES } from './shop';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class AdjustDto {
  @IsOptional() @IsInt() @Min(-9999) @Max(9999) hp?: number;
  @IsOptional() @IsInt() @Min(-9999) @Max(9999) mana?: number;
  @IsOptional() @IsInt() @Min(-99999) @Max(99999) xp?: number;
  @IsOptional() @IsInt() @Min(-99) @Max(99) level?: number;
  @IsOptional() @IsInt() @Min(-9999) @Max(9999) gold?: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  reason?: string;
}

/** Compra de 1 unidade de um item do catálogo da loja. */
export class BuyDto {
  @IsIn(SHOP_CODES)
  item!: string;
}

export const OFFER_KINDS = ['GIFT', 'TRADE'] as const;

/**
 * Oferta de doação (item ou ouro) ou de troca (item por item) a outro jogador.
 * Quais campos valem em cada caso é conferido no TransfersService.
 */
export class OfferDto {
  @IsUUID()
  toCharacterId!: string;

  @IsIn(OFFER_KINDS)
  kind!: (typeof OFFER_KINDS)[number];

  /** Item do inventário de quem oferece. */
  @IsOptional() @IsUUID() itemId?: string;
  @IsOptional() @IsInt() @Min(1) @Max(9999) qty?: number;

  /** Doação de ouro (no lugar de um item). */
  @IsOptional() @IsInt() @Min(1) @Max(9999) gold?: number;

  /** Só na troca: item do inventário de quem vai receber. */
  @IsOptional() @IsUUID() askItemId?: string;
  @IsOptional() @IsInt() @Min(1) @Max(9999) askQty?: number;
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

export class CreateNpcDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Dê um nome para o inimigo' })
  @MaxLength(60)
  name!: string;

  @IsInt() @Min(1) @Max(9999) hpMax!: number;

  /** Quantos criar de uma vez: com mais de um, o nome ganha número (Goblin 1, Goblin 2…). */
  @IsOptional() @IsInt() @Min(1) @Max(20) quantity?: number;
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
