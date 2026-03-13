import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { UsersService } from '../users/users.service';
import { RefreshTokenEntity } from './refresh-token.entity';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    @InjectRepository(RefreshTokenEntity)
    private readonly refreshTokens: Repository<RefreshTokenEntity>,
  ) {}

  async login(input: LoginDto) {
    let user = await this.usersService.findByEmail(input.email);
    if (!user) {
      user = await this.usersService.createUser({
        email: input.email,
        name: input.name ?? input.email.split('@')[0],
      });
    }

    const accessToken = await this.jwtService.signAsync(
      { sub: user.id, email: user.email },
      {
        secret: process.env.JWT_SECRET ?? 'dev-secret',
        expiresIn: '15m',
      },
    );

    const refreshToken = randomUUID() + randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.refreshTokens.save(
      this.refreshTokens.create({
        userId: user.id,
        token: refreshToken,
        expiresAt,
      }),
    );

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
    };
  }

  async refresh(refreshToken: string) {
    const existing = await this.refreshTokens.findOne({ where: { token: refreshToken } });
    if (!existing || new Date(existing.expiresAt).getTime() < Date.now()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.usersService.findById(existing.userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    await this.refreshTokens.delete({ token: refreshToken });

    const newAccessToken = await this.jwtService.signAsync(
      { sub: user.id, email: user.email },
      {
        secret: process.env.JWT_SECRET ?? 'dev-secret',
        expiresIn: '15m',
      },
    );

    const newRefreshToken = randomUUID() + randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.refreshTokens.save(
      this.refreshTokens.create({
        userId: user.id,
        token: newRefreshToken,
        expiresAt,
      }),
    );

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      tokenType: 'Bearer',
    };
  }

  async logout(refreshToken: string) {
    await this.refreshTokens.delete({ token: refreshToken });
    return { success: true };
  }
}
