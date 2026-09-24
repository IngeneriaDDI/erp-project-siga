import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CookieOptions, Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth.types';

const REFRESH_COOKIE = 'refresh_token';
const REFRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken, user } = await this.auth.login(
      dto.email,
      dto.password,
    );
    res.cookie(REFRESH_COOKIE, refreshToken, this.cookieOptions());
    return { accessToken, user: this.publicUser(user) };
  }

  @Public()
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.[REFRESH_COOKIE];
    const { accessToken, refreshToken, user } = await this.auth.refresh(token);
    res.cookie(REFRESH_COOKIE, refreshToken, this.cookieOptions());
    return { accessToken, user: this.publicUser(user) };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
    return { message: 'Sesión cerrada' };
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.userId);
  }

  private cookieOptions(): CookieOptions {
    // En local (mismo "site": localhost:8080 ↔ localhost:3000) basta con "lax".
    // En producción, frontend (Cloudflare) y backend (Railway) son dominios
    // distintos, por lo que la cookie necesita SameSite=None + Secure=true
    // para que el navegador la envíe en las peticiones cross-site del SPA.
    const sameSite = this.config.get<string>('COOKIE_SAME_SITE', 'lax') as
      | 'lax'
      | 'strict'
      | 'none';
    const secure =
      sameSite === 'none' ||
      this.config.get<string>('COOKIE_SECURE', 'false') === 'true';
    return {
      httpOnly: true,
      sameSite,
      secure,
      path: '/',
      maxAge: REFRESH_MAX_AGE_MS,
    };
  }

  private publicUser(user: AuthUser) {
    return {
      id: user.userId,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    };
  }
}
