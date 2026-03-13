import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { BoardEntity } from './board.entity';
import { CreateBoardDto } from './dto/create-board.dto';

@Injectable()
export class BoardsService {
  constructor(
    @InjectRepository(BoardEntity)
    private readonly boardsRepository: Repository<BoardEntity>,
    private readonly usersService: UsersService,
  ) {}

  listBoards(ownerUserId?: number): Promise<BoardEntity[]> {
    return this.boardsRepository.find({
      where: ownerUserId ? { ownerUserId } : {},
      order: { id: 'ASC' },
    });
  }

  async createBoard(input: CreateBoardDto): Promise<BoardEntity> {
    const owner = await this.usersService.findById(input.ownerUserId);
    if (!owner) {
      throw new NotFoundException(`User ${input.ownerUserId} not found`);
    }

    const entity = this.boardsRepository.create({
      ownerUserId: input.ownerUserId,
      title: input.title,
      description: input.description ?? null,
    });

    return this.boardsRepository.save(entity);
  }
}
