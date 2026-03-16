import { ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import { BoardsService } from './boards.service';

describe('BoardsService', () => {
  const repo = {
    find: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  } as any;

  let service: BoardsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BoardsService(repo);
  });

  it('lists boards for user ordered by id ASC', async () => {
    repo.find.mockResolvedValue([{ id: 1 }]);

    const result = await service.listBoards(42);

    expect(repo.find).toHaveBeenCalledWith({
      where: { ownerUserId: 42 },
      order: { id: 'ASC' },
    });
    expect(result).toEqual([{ id: 1 }]);
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
    });
    expect(result).toMatchObject({ id: 11, ownerUserId: 7, title: 'Roadmap' });
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

  it('deletes own board', async () => {
    repo.findOne.mockResolvedValue({ id: 15, ownerUserId: 7 });
    repo.delete.mockResolvedValue({ affected: 1 });

    const result = await service.deleteBoard(15, 7);

    expect(repo.delete).toHaveBeenCalledWith({ id: 15 });
    expect(result).toEqual({ success: true });
  });
});
