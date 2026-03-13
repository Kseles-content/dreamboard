import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { LogoutDto } from './dto/logout.dto';

@Controller('v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() input: LoginDto) {
    return this.authService.login(input);
  }

  @Post('refresh')
  refresh(@Body() input: RefreshDto) {
    return this.authService.refresh(input.refreshToken);
  }

  @Post('logout')
  logout(@Body() input: LogoutDto) {
    return this.authService.logout(input.refreshToken);
  }
}
