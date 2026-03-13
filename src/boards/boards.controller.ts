import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { BoardEntity } from './board.entity';
import { BoardsService } from './boards.service';
import { CreateBoardDto } from './dto/create-board.dto';
import { ListBoardsQueryDto } from './dto/list-boards-query.dto';

@Controller('boards')
export class BoardsController {
  constructor(private readonly boardsService: BoardsService) {}

  @Get()
  listBoards(@Query() query: ListBoardsQueryDto): Promise<BoardEntity[]> {
    return this.boardsService.listBoards(query.ownerUserId);
  }

  @Post()
  createBoard(@Body() input: CreateBoardDto): Promise<BoardEntity> {
    return this.boardsService.createBoard(input);
  }
}
