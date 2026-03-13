import { Injectable, NotFoundException, ForbiddenException, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BoardEntity } from './board.entity';
import { CreateBoardDto } from './dto/create-board.dto';

@Injectable()
export class BoardsService {
  constructor(
    @InjectRepository(BoardEntity)
    private readonly boardsRepository: Repository<BoardEntity>,
  ) {}

  listBoards(userId: number): Promise<BoardEntity[]> {
    return this.boardsRepository.find({
      where: { ownerUserId: userId },
      order: { id: 'ASC' },
    });
  }

  async getBoardById(id: number, userId: number): Promise<BoardEntity> {
    const board = await this.boardsRepository.findOne({ where: { id } });
    if (!board) {
      throw new NotFoundException(`Board ${id} not found`);
    }
    if (board.ownerUserId !== userId) {
      throw new ForbiddenException('No access to this board');
    }
    return board;
  }

  async createBoard(input: CreateBoardDto, userId: number, requestId: string): Promise<BoardEntity> {
    const boardsCount = await this.boardsRepository.count({ where: { ownerUserId: userId } });
    if (boardsCount >= 50) {
      throw new HttpException(
        {
          code: 'BOARD_LIMIT_REACHED',
          message: 'Board limit reached: maximum 50 boards per user',
          requestId,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const entity = this.boardsRepository.create({
      ownerUserId: userId,
      title: input.title,
      description: input.description ?? null,
    });

    return this.boardsRepository.save(entity);
  }

  async deleteBoard(id: number, userId: number): Promise<{ success: true }> {
    const board = await this.getBoardById(id, userId);
    await this.boardsRepository.delete({ id: board.id });
    return { success: true };
  }
}
