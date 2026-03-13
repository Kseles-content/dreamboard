import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('DreamBoard API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          dropSchema: true,
          entities: [__dirname + '/../src/**/*.entity.ts'],
          synchronize: true,
        }),
        AppModule,
      ],
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

  it('creates and lists users', async () => {
    await request(app.getHttpServer())
      .post('/users')
      .send({ email: 'john@example.com', name: 'John' })
      .expect(201);

    const response = await request(app.getHttpServer()).get('/users').expect(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].email).toBe('john@example.com');
  });

  it('creates and filters boards', async () => {
    const user = await request(app.getHttpServer())
      .post('/users')
      .send({ email: 'owner@example.com', name: 'Owner' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/boards')
      .send({ ownerUserId: user.body.id, title: 'Roadmap', description: 'Q2 goals' })
      .expect(201);

    const filtered = await request(app.getHttpServer())
      .get('/boards')
      .query({ ownerUserId: user.body.id })
      .expect(200);

    expect(filtered.body).toHaveLength(1);
    expect(filtered.body[0].title).toBe('Roadmap');
  });
});
