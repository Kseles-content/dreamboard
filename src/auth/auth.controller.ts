import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { minutes, Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { LogoutDto } from './dto/logout.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RequestWithId } from '../common/request-with-id';
import { RevokeTokenDto } from './dto/revoke-token.dto';

@Controller('v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: minutes(15) } })
  login(@Body() input: LoginDto) {
    return this.authService.login(input);
  }

  @Post('refresh')
  @Throttle({ default: { limit: 10, ttl: minutes(1) } })
  refresh(@Body() input: RefreshDto) {
    return this.authService.refresh(input.refreshToken);
  }

  @Post('logout')
  logout(@Body() input: LogoutDto) {
    return this.authService.logout(input.refreshToken);
  }

  @Post('revoke-all')
  @UseGuards(JwtAuthGuard)
  revokeAll(@Req() req: RequestWithId) {
    return this.authService.revokeAll(req.user!.sub);
  }

  @Post('revoke-token')
  @UseGuards(JwtAuthGuard)
  revokeTokenById(@Req() req: RequestWithId, @Body() input: RevokeTokenDto) {
    return this.authService.revokeTokenById(req.user!.sub, input.tokenId);
  }
}
