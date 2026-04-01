import { Controller, Post, Body } from '@nestjs/common';

@Controller('v1/auth')
export class AuthController {
  @Post('login')
  login(@Body() body: any) {
    // Временный mock для тестирования
    return {
      accessToken: 'mock-token',
      refreshToken: 'mock-refresh',
      user: { id: 1, email: body.email || 'demo@example.com' }
    };
  }

  @Post('refresh')
  refresh() {
    return { accessToken: 'new-mock-token' };
  }

  @Post('logout')
  logout() {
    return { message: 'logged out' };
  }
}
