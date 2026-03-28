import { ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import { MoreThan } from 'typeorm';
import { BoardsService } from './boards.service';

describe('BoardsService', () => {
  const repo = {
    find: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    softDelete: jest.fn(),
  } as any;

  let service: BoardsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BoardsService(repo);
  });

  it('lists boards with cursor pagination', async () => {
    repo.find.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);

    const result = await service.listBoards(42, 2);

    expect(repo.find).toHaveBeenCalledWith({
      where: { ownerUserId: 42 },
      order: { id: 'ASC' },
      take: 3,
    });
    expect(result).toEqual({ items: [{ id: 1 }, { id: 2 }], nextCursor: 2 });
  });

  it('uses cursor in list query', async () => {
    repo.find.mockResolvedValue([{ id: 8 }]);

    await service.listBoards(42, 20, 7);

    expect(repo.find).toHaveBeenCalledWith({
      where: { ownerUserId: 42, id: MoreThan(7) },
      order: { id: 'ASC' },
      take: 21,
    });
  });

  it('throws NotFound when board does not exist', async () => {
    repo.findOne.mockResolvedValue(null);

    await expect(service.getBoardById(10, 1)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws Forbidden when board belongs to another user', async () => {
    repo.findOne.mockResolvedValue({ id: 10, ownerUserId: 99 });

    await expect(service.getBoardById(10, 1)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('creates board when under limit', async () => {
    repo.count.mockResolvedValue(3);
    repo.create.mockImplementation((v: unknown) => v);
    repo.save.mockImplementation(async (v: unknown) => ({ id: 11, ...(v as object) }));

    const result = await service.createBoard({ title: 'Roadmap', description: 'Q2' }, 7, 'req-1');

    expect(repo.count).toHaveBeenCalledWith({ where: { ownerUserId: 7 } });
    expect(repo.create).toHaveBeenCalledWith({
      ownerUserId: 7,
      title: 'Roadmap',
      description: 'Q2',
      stateJson: '{"cards":[]}',
    });
    expect(result).toMatchObject({ id: 11, ownerUserId: 7, title: 'Roadmap' });
  });

  it('updates board fields', async () => {
    repo.findOne.mockResolvedValue({ id: 10, ownerUserId: 7, title: 'Old', description: null });
    repo.save.mockImplementation(async (v: unknown) => v);

    const result = await service.updateBoard(10, { title: 'New' }, 7);

    expect(result).toMatchObject({ id: 10, title: 'New' });
  });

  it('returns BOARD_LIMIT_REACHED when user has 50 boards', async () => {
    repo.count.mockResolvedValue(50);

    try {
      await service.createBoard({ title: 'Overflow' }, 7, 'req-limit');
      throw new Error('Expected createBoard to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      const httpError = error as HttpException;
      expect(httpError.getStatus()).toBe(400);
      expect(httpError.getResponse()).toEqual({
        code: 'BOARD_LIMIT_REACHED',
        message: 'Board limit reached: maximum 50 boards per user',
        requestId: 'req-limit',
      });
    }
  });

  it('soft-deletes own board', async () => {
    repo.findOne.mockResolvedValue({ id: 15, ownerUserId: 7 });
    repo.softDelete.mockResolvedValue({ affected: 1 });

    const result = await service.deleteBoard(15, 7);

    expect(repo.softDelete).toHaveBeenCalledWith({ id: 15 });
    expect(result).toEqual({ success: true });
  });

  it('creates upload intent for allowed mime', async () => {
    repo.findOne.mockResolvedValue({ id: 15, ownerUserId: 7 });

    const result = await service.createUploadIntent(15, 7, {
      mimeType: 'image/png',
      sizeBytes: 1024,
      fileName: 'hero.png',
    });

    expect(result).toMatchObject({
      method: 'PUT',
      headers: { 'content-type': 'image/png' },
      maxSizeBytes: 10 * 1024 * 1024,
    });
    expect(result.objectKey).toContain('boards/15/uploads/');
    expect(result.uploadUrl).toContain(result.objectKey);
    expect(result.publicUrl).toContain(result.objectKey);
  });

  it('rejects upload intent with unsupported mime', async () => {
    repo.findOne.mockResolvedValue({ id: 15, ownerUserId: 7 });

    await expect(
      service.createUploadIntent(15, 7, {
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        fileName: 'doc.pdf',
      }),
    ).rejects.toMatchObject({
      status: 400,
      response: {
        code: 'UPLOAD_MIME_NOT_ALLOWED',
      },
    });
  });
});
