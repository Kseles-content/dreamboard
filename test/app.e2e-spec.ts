process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpErrorFilter } from '../src/common/http-error.filter';

describe('DreamBoard API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
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
    app.useGlobalFilters(new HttpErrorFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('login returns tokens', async () => {
    const login = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: 'john@example.com', name: 'John' })
      .expect(201);

    expect(login.body.accessToken).toBeTruthy();
    expect(login.body.refreshToken).toBeTruthy();
  });

  it('rejects unauthorized boards access with unified envelope', async () => {
    const res = await request(app.getHttpServer()).get('/v1/boards').expect(401);
    expect(res.body).toMatchObject({
      code: 'UNAUTHORIZED',
      message: 'Missing bearer token',
    });
    expect(res.body.requestId).toBeTruthy();
  });

  it('supports auth + boards CRUD flow with soft delete', async () => {
    const login = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: 'crud@example.com', name: 'Crud User' })
      .expect(201);

    const token = login.body.accessToken as string;

    const create = await request(app.getHttpServer())
      .post('/v1/boards')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Roadmap', description: 'Q2 goals' })
      .expect(201);

    const boardId = create.body.id as number;

    await request(app.getHttpServer())
      .patch(`/v1/boards/${boardId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Roadmap Updated' })
      .expect(200);

    const getOne = await request(app.getHttpServer())
      .get(`/v1/boards/${boardId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(getOne.body.title).toBe('Roadmap Updated');

    await request(app.getHttpServer())
      .delete(`/v1/boards/${boardId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const deleted = await request(app.getHttpServer())
      .get(`/v1/boards/${boardId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    expect(deleted.body.code).toBe('NOT_FOUND');
  });

  it('returns BOARD_LIMIT_REACHED after 50 boards with machine code', async () => {
    const login = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: 'limit@example.com', name: 'Limit User' })
      .expect(201);

    const token = login.body.accessToken as string;

    for (let i = 1; i <= 50; i += 1) {
      await request(app.getHttpServer())
        .post('/v1/boards')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: `Board ${i}` })
        .expect(201);
    }

    const overflow = await request(app.getHttpServer())
      .post('/v1/boards')
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

  it('cursor pagination is stable across sequential calls', async () => {
    const login = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: 'cursor@example.com', name: 'Cursor User' })
      .expect(201);

    const token = login.body.accessToken as string;

    for (let i = 1; i <= 5; i += 1) {
      await request(app.getHttpServer())
        .post('/v1/boards')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: `Cursor ${i}` })
        .expect(201);
    }

    const page1 = await request(app.getHttpServer())
      .get('/v1/boards?limit=2')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(page1.body.items).toHaveLength(2);
    expect(page1.body.nextCursor).toBeTruthy();

    const page2 = await request(app.getHttpServer())
      .get(`/v1/boards?limit=2&cursor=${page1.body.nextCursor}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(page2.body.items).toHaveLength(2);

    const ids1 = page1.body.items.map((b: { id: number }) => b.id);
    const ids2 = page2.body.items.map((b: { id: number }) => b.id);

    expect(ids1[1]).toBeLessThan(ids2[0]);
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
