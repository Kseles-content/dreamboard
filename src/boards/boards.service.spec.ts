import { HttpException } from '@nestjs/common';
import { BoardsService } from './boards.service';

describe('BoardsService', () => {
  const prisma = {
    board: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    card: {
      count: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    uploadAsset: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  } as any;

  const configService = {
    getOrThrow: jest.fn((key: string) => {
      const map: Record<string, string> = {
        'storage.uploadBaseUrl': 'https://uploads.test.local',
        'storage.publicBaseUrl': 'https://cdn.test.local',
        'storage.publicWebBaseUrl': 'http://localhost:3100',
      };
      return map[key];
    }),
  } as any;

  let service: BoardsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BoardsService(prisma, configService);
  });

  it('lists boards with cursor pagination', async () => {
    prisma.board.findMany.mockResolvedValue([
      { id: 1, title: 'A', description: null, createdAt: new Date(), updatedAt: new Date() },
      { id: 2, title: 'B', description: null, createdAt: new Date(), updatedAt: new Date() },
      { id: 3, title: 'C', description: null, createdAt: new Date(), updatedAt: new Date() },
    ]);

    const result = await service.listBoards(7, { limit: 2, cursor: 1 });

    expect(prisma.board.findMany).toHaveBeenCalledWith({
      where: { ownerId: 7, deletedAt: null, id: { gt: 1 } },
      orderBy: { id: 'asc' },
      take: 3,
    });
    expect(result).toHaveLength(2);
  });

  it('returns BOARD_LIMIT_REACHED when user has 50 boards', async () => {
    prisma.board.count.mockResolvedValue(50);

    await expect(service.createBoard({ title: 'Overflow' }, 7, 'req-limit')).rejects.toBeInstanceOf(HttpException);
  });

  it('creates upload intent for allowed mime', async () => {
    prisma.board.findFirst.mockResolvedValue({ id: 15, ownerId: 7, deletedAt: null });
    prisma.uploadAsset.create.mockResolvedValue({ id: 1 });

    const result = await service.createUploadIntent(15, 7, {
      mimeType: 'image/png',
      sizeBytes: 1024,
      fileName: 'hero.png',
    });

    expect(result.method).toBe('PUT');
    expect(result.headers['content-type']).toBe('image/png');
    expect(result.objectKey).toContain('boards/15/uploads/');
    expect(result.uploadUrl).toContain('https://uploads.test.local/');
  });
});
