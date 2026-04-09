process.env.DATABASE_URL = 'postgresql://dreamboard:dreamboard123@localhost:5433/dreamboard';
process.env.JWT_SECRET = 'test-secret';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppModule } from '../src/app.module';
import { HttpErrorFilter } from '../src/common/http-error.filter';

describe('DreamBoard API (e2e)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

  beforeAll(async () => {
    await prisma.refreshToken.deleteMany();
    await prisma.shareLink.deleteMany();
    await prisma.boardVersion.deleteMany();
    await prisma.uploadAsset.deleteMany();
    await prisma.board.deleteMany();
    await prisma.user.deleteMany();
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
    await prisma.$disconnect();
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

    expect(page1.body).toHaveLength(2);
    const cursor = page1.body[1]?.id;
    expect(cursor).toBeTruthy();

    const page2 = await request(app.getHttpServer())
      .get(`/v1/boards?limit=2&cursor=${cursor}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(page2.body).toHaveLength(2);

    const ids1 = page1.body.map((b: { id: string }) => Number(b.id));
    const ids2 = page2.body.map((b: { id: string }) => Number(b.id));

    expect(ids1[1]).toBeLessThan(ids2[0]);
  });

  it('supports versions snapshot, list, restore and VERSION_NOT_FOUND', async () => {
    const login = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: 'versions@example.com', name: 'Versions User' })
      .expect(201);

    const token = login.body.accessToken as string;

    const createBoard = await request(app.getHttpServer())
      .post('/v1/boards')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Versioned board', description: 'initial' })
      .expect(201);

    const boardId = createBoard.body.id as number;

    await request(app.getHttpServer())
      .post(`/v1/boards/${boardId}/cards`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'v1 text' })
      .expect(201);

    const v1 = await request(app.getHttpServer())
      .post(`/v1/boards/${boardId}/versions`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/v1/boards/${boardId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Versioned board changed' })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/v1/boards/${boardId}/cards`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'v2 text' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/v1/boards/${boardId}/versions`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    const listPage1 = await request(app.getHttpServer())
      .get(`/v1/boards/${boardId}/versions?limit=1`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(listPage1.body.items).toHaveLength(1);
    expect(listPage1.body.nextCursor).toBeTruthy();

    const listPage2 = await request(app.getHttpServer())
      .get(`/v1/boards/${boardId}/versions?limit=1&cursor=${listPage1.body.nextCursor}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(listPage2.body.items).toHaveLength(1);
    expect(listPage1.body.items[0].id).toBeGreaterThan(listPage2.body.items[0].id);

    await request(app.getHttpServer())
      .post(`/v1/boards/${boardId}/versions/999999/restore`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404)
      .expect((res) => {
        expect(res.body.code).toBe('VERSION_NOT_FOUND');
      });

    await request(app.getHttpServer())
      .post(`/v1/boards/${boardId}/versions/${v1.body.id}/restore`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    const restoredBoard = await request(app.getHttpServer())
      .get(`/v1/boards/${boardId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(restoredBoard.body.title).toBe('Versioned board');

    const restoredCards = await request(app.getHttpServer())
      .get(`/v1/boards/${boardId}/cards`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(restoredCards.body).toHaveLength(1);
    expect(restoredCards.body[0].text).toBe('v1 text');
  });

  it('supports share links lifecycle and public view-only access', async () => {
    const login = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: 'share@example.com', name: 'Share Owner' })
      .expect(201);

    const token = login.body.accessToken as string;

    const createBoard = await request(app.getHttpServer())
      .post('/v1/boards')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Share board', description: 'public demo' })
      .expect(201);

    const boardId = createBoard.body.id as number;

    await request(app.getHttpServer())
      .post(`/v1/boards/${boardId}/cards`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'public card' })
      .expect(201);

    const share = await request(app.getHttpServer())
      .post(`/v1/boards/${boardId}/share-links`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    expect(share.body.token).toBeTruthy();
    expect(share.body.url).toContain('/share/');

    const listed = await request(app.getHttpServer())
      .get(`/v1/boards/${boardId}/share-links`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(listed.body.items.length).toBeGreaterThan(0);

    const publicBoard = await request(app.getHttpServer())
      .get(`/v1/share/${share.body.token}`)
      .expect(200);

    expect(publicBoard.body.board.title).toBe('Share board');
    expect(publicBoard.body.board.cards[0].text).toBe('public card');

    await request(app.getHttpServer())
      .patch('/v1/boards/1')
      .expect(401);

    await request(app.getHttpServer())
      .delete(`/v1/boards/${boardId}/share-links/${share.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/v1/share/${share.body.token}`)
      .expect(404)
      .expect((res) => {
        expect(res.body.code).toBe('SHARE_LINK_NOT_FOUND');
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

  it('creates upload intent for board image', async () => {
    const login = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: 'upload@example.com', name: 'Upload User' })
      .expect(201);

    const token = login.body.accessToken as string;

    const createBoard = await request(app.getHttpServer())
      .post('/v1/boards')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Upload board' })
      .expect(201);

    const boardId = createBoard.body.id as number;

    const intent = await request(app.getHttpServer())
      .post(`/v1/boards/${boardId}/uploads/intents`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        mimeType: 'image/png',
        sizeBytes: 2048,
        fileName: 'cover.png',
      })
      .expect(201);

    expect(intent.body.method).toBe('PUT');
    expect(intent.body.headers['content-type']).toBe('image/png');
    expect(intent.body.objectKey).toContain(`boards/${boardId}/uploads/`);

    const finalized = await request(app.getHttpServer())
      .post(`/v1/boards/${boardId}/uploads/finalize`)
      .set('Authorization', `Bearer ${token}`)
      .send({ objectKey: intent.body.objectKey, etag: 'etag-demo' })
      .expect(201);

    expect(finalized.body.status).toBe('READY');
    expect(finalized.body.objectKey).toBe(intent.body.objectKey);

    const imageCard = await request(app.getHttpServer())
      .post(`/v1/boards/${boardId}/cards`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'image', objectKey: intent.body.objectKey })
      .expect(201);

    expect(imageCard.body.created.type).toBe('image');
    expect(imageCard.body.created.objectKey).toBe(intent.body.objectKey);

    const listed = await request(app.getHttpServer())
      .get(`/v1/boards/${boardId}/cards`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(listed.body.some((x: any) => x.type === 'image')).toBe(true);

    const unsupported = await request(app.getHttpServer())
      .post(`/v1/boards/${boardId}/uploads/intents`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        mimeType: 'application/pdf',
        sizeBytes: 2048,
        fileName: 'x.pdf',
      })
      .expect(400);

    expect(unsupported.body.code).toBe('UNSUPPORTED_ASSET_TYPE');

    const tooLarge = await request(app.getHttpServer())
      .post(`/v1/boards/${boardId}/uploads/intents`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        mimeType: 'image/png',
        sizeBytes: 10 * 1024 * 1024 + 1,
        fileName: 'huge.png',
      })
      .expect(400);

    expect(tooLarge.body.code).toBe('ASSET_TOO_LARGE');
  });

  it('PATCH card is idempotent for same payload', async () => {
    const login = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: 'idem@example.com', name: 'Idem User' })
      .expect(201);

    const token = login.body.accessToken as string;

    const createBoard = await request(app.getHttpServer())
      .post('/v1/boards')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Idempotent board' })
      .expect(201);

    const boardId = createBoard.body.id as number;

    const createCard = await request(app.getHttpServer())
      .post(`/v1/boards/${boardId}/cards`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'hello' })
      .expect(201);

    const cardId = createCard.body.created.id as string;

    const first = await request(app.getHttpServer())
      .patch(`/v1/boards/${boardId}/cards/${cardId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'same-text' })
      .expect(200);

    const second = await request(app.getHttpServer())
      .patch(`/v1/boards/${boardId}/cards/${cardId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'same-text' })
      .expect(200);

    expect(first.body.text).toBe('same-text');
    expect(second.body.text).toBe('same-text');
  });
});
