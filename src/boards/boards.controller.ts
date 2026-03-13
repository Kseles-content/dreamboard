import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Req, UseGuards } from '@nestjs/common';
import { BoardEntity } from './board.entity';
import { BoardsService } from './boards.service';
import { CreateBoardDto } from './dto/create-board.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestWithId } from '../common/request-with-id';

@UseGuards(JwtAuthGuard)
@Controller('boards')
export class BoardsController {
  constructor(private readonly boardsService: BoardsService) {}

  @Get()
  listBoards(@Req() req: RequestWithId): Promise<BoardEntity[]> {
    return this.boardsService.listBoards(req.user!.sub);
  }

  @Get(':id')
  getBoardById(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithId): Promise<BoardEntity> {
    return this.boardsService.getBoardById(id, req.user!.sub);
  }

  @Post()
  createBoard(@Body() input: CreateBoardDto, @Req() req: RequestWithId): Promise<BoardEntity> {
    return this.boardsService.createBoard(input, req.user!.sub, req.requestId);
  }

  @Delete(':id')
  deleteBoard(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithId): Promise<{ success: true }> {
    return this.boardsService.deleteBoard(id, req.user!.sub);
  }
}
