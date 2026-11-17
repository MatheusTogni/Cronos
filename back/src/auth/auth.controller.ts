import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { AuthUser } from './auth-user';
import { AuthService } from './auth.service';
import { CurrentUser, Public } from './decorators';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @UseGuards(ThrottlerGuard) // limite de tentativas por IP (ver login-throttle.ts)
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.username, dto.password);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}
