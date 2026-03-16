process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('DreamBoard API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.DB_PATH = ':memory:';
    process.env.JWT_SECRET = 'test-secret';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('supports auth + boards flow', async () => {
    const login = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: 'john@example.com', name: 'John' })
      .expect(201);

    const token = login.body.accessToken as string;
    expect(token).toBeTruthy();

    const create = await request(app.getHttpServer())
      .post('/boards')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Roadmap', description: 'Q2 goals' })
      .expect(201);

    const boardId = create.body.id as number;

    await request(app.getHttpServer())
      .get('/boards')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/boards/${boardId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/boards/${boardId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('returns BOARD_LIMIT_REACHED after 50 boards', async () => {
    const login = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: 'limit@example.com', name: 'Limit User' })
      .expect(201);

    const token = login.body.accessToken as string;

    for (let i = 1; i <= 50; i += 1) {
      await request(app.getHttpServer())
        .post('/boards')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: `Board ${i}` })
        .expect(201);
    }

    const overflow = await request(app.getHttpServer())
      .post('/boards')
      .set('Authorization', `Bearer ${token}`)
      .set('x-request-id', 'test-request-id-limit')
      .send({ title: 'Board 51' })
      .expect(400);

    expect(overflow.body).toMatchObject({
      code: 'BOARD_LIMIT_REACHED',
      message: 'Board limit reached: maximum 50 boards per user',
      requestId: 'test-request-id-limit',
    });
  });

  it('refreshes and logs out', async () => {
    const login = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: 'refresh@example.com', name: 'Ref' })
      .expect(201);

    const refreshToken = login.body.refreshToken as string;

    const refreshed = await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refreshToken })
      .expect(201);

    expect(refreshed.body.accessToken).toBeTruthy();

    await request(app.getHttpServer())
      .post('/v1/auth/logout')
      .send({ refreshToken: refreshed.body.refreshToken })
      .expect(201);
  });
});
