import { ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import { MoreThan } from 'typeorm';
import { BoardsService } from './boards.service';

describe('BoardsService', () => {
  const boardsRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    softDelete: jest.fn(),
  } as any;

  const uploadsRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  } as any;

  let service: BoardsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BoardsService(boardsRepo, uploadsRepo);
  });

  it('lists boards with cursor pagination', async () => {
    boardsRepo.find.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);

    const result = await service.listBoards(42, 2);

    expect(boardsRepo.find).toHaveBeenCalledWith({
      where: { ownerUserId: 42 },
      order: { id: 'ASC' },
      take: 3,
    });
    expect(result).toEqual({ items: [{ id: 1 }, { id: 2 }], nextCursor: 2 });
  });

  it('uses cursor in list query', async () => {
    boardsRepo.find.mockResolvedValue([{ id: 8 }]);

    await service.listBoards(42, 20, 7);

    expect(boardsRepo.find).toHaveBeenCalledWith({
      where: { ownerUserId: 42, id: MoreThan(7) },
      order: { id: 'ASC' },
      take: 21,
    });
  });

  it('throws NotFound when board does not exist', async () => {
    boardsRepo.findOne.mockResolvedValue(null);

    await expect(service.getBoardById(10, 1)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws Forbidden when board belongs to another user', async () => {
    boardsRepo.findOne.mockResolvedValue({ id: 10, ownerUserId: 99 });

    await expect(service.getBoardById(10, 1)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('creates board when under limit', async () => {
    boardsRepo.count.mockResolvedValue(3);
    boardsRepo.create.mockImplementation((v: unknown) => v);
    boardsRepo.save.mockImplementation(async (v: unknown) => ({ id: 11, ...(v as object) }));

    const result = await service.createBoard({ title: 'Roadmap', description: 'Q2' }, 7, 'req-1');

    expect(boardsRepo.count).toHaveBeenCalledWith({ where: { ownerUserId: 7 } });
    expect(boardsRepo.create).toHaveBeenCalledWith({
      ownerUserId: 7,
      title: 'Roadmap',
      description: 'Q2',
      stateJson: '{"cards":[]}',
    });
    expect(result).toMatchObject({ id: 11, ownerUserId: 7, title: 'Roadmap' });
  });

  it('updates board fields', async () => {
    boardsRepo.findOne.mockResolvedValue({ id: 10, ownerUserId: 7, title: 'Old', description: null });
    boardsRepo.save.mockImplementation(async (v: unknown) => v);

    const result = await service.updateBoard(10, { title: 'New' }, 7);

    expect(result).toMatchObject({ id: 10, title: 'New' });
  });

  it('returns BOARD_LIMIT_REACHED when user has 50 boards', async () => {
    boardsRepo.count.mockResolvedValue(50);

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
    boardsRepo.findOne.mockResolvedValue({ id: 15, ownerUserId: 7 });
    boardsRepo.softDelete.mockResolvedValue({ affected: 1 });

    const result = await service.deleteBoard(15, 7);

    expect(boardsRepo.softDelete).toHaveBeenCalledWith({ id: 15 });
    expect(result).toEqual({ success: true });
  });

  it('creates upload intent for allowed mime', async () => {
    boardsRepo.findOne.mockResolvedValue({ id: 15, ownerUserId: 7 });
    uploadsRepo.create.mockImplementation((v: unknown) => v);
    uploadsRepo.save.mockResolvedValue({ id: 77 });

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
    expect(uploadsRepo.create).toHaveBeenCalled();
    expect(result.objectKey).toContain('boards/15/uploads/');
    expect(result.uploadUrl).toContain(result.objectKey);
    expect(result.publicUrl).toContain(result.objectKey);
  });

  it('rejects upload intent with unsupported mime', async () => {
    boardsRepo.findOne.mockResolvedValue({ id: 15, ownerUserId: 7 });

    await expect(
      service.createUploadIntent(15, 7, {
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        fileName: 'doc.pdf',
      }),
    ).rejects.toMatchObject({
      status: 400,
      response: {
        code: 'UNSUPPORTED_ASSET_TYPE',
      },
    });
  });


  it('rejects upload intent when asset exceeds max size', async () => {
    boardsRepo.findOne.mockResolvedValue({ id: 15, ownerUserId: 7 });

    await expect(
      service.createUploadIntent(15, 7, {
        mimeType: 'image/png',
        sizeBytes: 10 * 1024 * 1024 + 1,
        fileName: 'huge.png',
      }),
    ).rejects.toMatchObject({
      status: 400,
      response: {
        code: 'ASSET_TOO_LARGE',
      },
    });
  });

  it('finalizes upload intent and returns metadata', async () => {
    boardsRepo.findOne.mockResolvedValue({ id: 15, ownerUserId: 7 });
    uploadsRepo.findOne.mockResolvedValue({
      id: 77,
      boardId: 15,
      ownerUserId: 7,
      objectKey: 'boards/15/uploads/file.png',
      mimeType: 'image/png',
      sizeBytes: 100,
      status: 'INTENT_CREATED',
      publicUrl: 'https://cdn.local/boards/15/uploads/file.png',
      finalizedAt: null,
    });
    uploadsRepo.save.mockImplementation(async (v: any) => v);

    const result = await service.finalizeUpload(15, 7, {
      objectKey: 'boards/15/uploads/file.png',
      etag: 'etag1',
    });

    expect(result.status).toBe('READY');
    expect(result.objectKey).toBe('boards/15/uploads/file.png');
    expect(result.finalizedAt).toBeTruthy();
  });
});
