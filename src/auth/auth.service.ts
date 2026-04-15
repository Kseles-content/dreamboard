import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async login(input: LoginDto) {
    let user = await this.usersService.findByEmail(input.email);
    if (!user) {
      user = await this.usersService.createUser({
        email: input.email,
        name: input.name ?? input.email.split('@')[0],
      });
    }

    return this.issueTokenPair(user.id, user.email, user.onboardedAt);
  }

  async refresh(refreshToken: string) {
    const existing = await this.prisma.refreshToken.findUnique({ where: { token: refreshToken } });
    if (!existing || new Date(existing.expiresAt).getTime() < Date.now()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.usersService.findById(existing.userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.delete({ where: { token: refreshToken } });

      const accessToken = await this.jwtService.signAsync(
        { sub: user.id, email: user.email },
        {
          secret: this.configService.getOrThrow<string>('auth.jwtSecret'),
          expiresIn: '15m',
        },
      );

      const newRefreshToken = randomUUID() + randomUUID();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const created = await tx.refreshToken.create({
        data: {
          userId: user.id,
          token: newRefreshToken,
          expiresAt,
        },
      });

      return {
        accessToken,
        refreshToken: newRefreshToken,
        refreshTokenId: created.id,
        tokenType: 'Bearer',
      };
    });
  }

  async logout(refreshToken: string) {
    await this.prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
    return { success: true };
  }

  async revokeAll(userId: number) {
    const result = await this.prisma.refreshToken.deleteMany({ where: { userId } });
    return { revoked: result.count };
  }

  async revokeTokenById(userId: number, tokenId: number) {
    const token = await this.prisma.refreshToken.findFirst({ where: { id: tokenId, userId } });
    if (!token) {
      throw new NotFoundException('Refresh token not found');
    }
    await this.prisma.refreshToken.delete({ where: { id: tokenId } });
    return { revoked: true, tokenId };
  }

  private async issueTokenPair(userId: number, email: string, onboardedAt: Date | null) {
    const accessToken = await this.jwtService.signAsync(
      { sub: userId, email },
      {
        secret: this.configService.getOrThrow<string>('auth.jwtSecret'),
        expiresIn: '15m',
      },
    );

    const refreshToken = randomUUID() + randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const created = await this.prisma.refreshToken.create({
      data: {
        userId,
        token: refreshToken,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
      refreshTokenId: created.id,
      tokenType: 'Bearer',
      user: {
        id: userId,
        email,
        onboardedAt: onboardedAt ? onboardedAt.toISOString() : null,
      },
    };
  }
}
