import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { diskStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser, Roles } from '../auth/decorators';
import { ImagesService } from './images.service';
import { ensureUploadDir } from './upload-dir';

const Id = () => new ParseUUIDPipe({ version: '4' });
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export const MAX_IMAGE_MB = 15;
const EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

class UploadImageDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  title?: string;
}

class RenameImageDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Dê um título para a imagem' })
  @MaxLength(80)
  title!: string;
}

class ShowImageDto {
  @IsUUID()
  imageId!: string;

  /** Quem vê a imagem. Ausente ou vazio = todos os jogadores. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  userIds?: string[];
}

@Controller()
@Roles(Role.MASTER)
export class ImagesController {
  constructor(private readonly images: ImagesService) {}

  @Get('campaigns/:id/images')
  list(@Param('id', Id()) id: string, @CurrentUser() user: AuthUser) {
    return this.images.list(id, user);
  }

  @Post('campaigns/:id/images')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => cb(null, ensureUploadDir()),
        filename: (_req, file, cb) =>
          cb(null, `${randomUUID()}${EXT[file.mimetype] ?? ''}`),
      }),
      limits: { fileSize: MAX_IMAGE_MB * 1024 * 1024, files: 1 },
      fileFilter: (_req, file, cb) =>
        EXT[file.mimetype]
          ? cb(null, true)
          : cb(
              new BadRequestException('Envie uma imagem PNG, JPG, WEBP ou GIF'),
              false,
            ),
    }),
  )
  upload(
    @Param('id', Id()) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadImageDto,
    @CurrentUser() user: AuthUser,
  ) {
    if (!file) throw new BadRequestException('Escolha uma imagem');
    return this.images.upload(id, file, dto.title, user);
  }

  @Patch('images/:id')
  rename(
    @Param('id', Id()) id: string,
    @Body() dto: RenameImageDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.images.rename(id, dto.title, user);
  }

  @Delete('images/:id')
  @HttpCode(204)
  remove(@Param('id', Id()) id: string, @CurrentUser() user: AuthUser) {
    return this.images.remove(id, user);
  }

  @Post('campaigns/:id/show-image')
  @HttpCode(204)
  show(
    @Param('id', Id()) id: string,
    @Body() dto: ShowImageDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.images.show(id, dto.imageId, dto.userIds, user);
  }

  @Post('campaigns/:id/hide-image')
  @HttpCode(204)
  hide(@Param('id', Id()) id: string, @CurrentUser() user: AuthUser) {
    return this.images.hide(id, user);
  }
}
