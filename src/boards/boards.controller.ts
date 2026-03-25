import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { BoardEntity } from './board.entity';
import { BoardsService } from './boards.service';
import { CreateBoardDto } from './dto/create-board.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestWithId } from '../common/request-with-id';
import { UpdateBoardDto } from './dto/update-board.dto';
import { ListBoardsQueryDto } from './dto/list-boards-query.dto';
import { CreateCardDto } from './dto/create-card.dto';
import { UpdateCardDto } from './dto/update-card.dto';

@UseGuards(JwtAuthGuard)
@Controller('v1/boards')
export class BoardsController {
  constructor(private readonly boardsService: BoardsService) {}

  @Get()
  listBoards(
    @Req() req: RequestWithId,
    @Query() query: ListBoardsQueryDto,
  ): Promise<{ items: BoardEntity[]; nextCursor: number | null }> {
    return this.boardsService.listBoards(req.user!.sub, query.limit ?? 20, query.cursor);
  }

  @Get(':boardId')
  getBoardById(@Param('boardId', ParseIntPipe) id: number, @Req() req: RequestWithId): Promise<BoardEntity> {
    return this.boardsService.getBoardById(id, req.user!.sub);
  }

  @Post()
  createBoard(@Body() input: CreateBoardDto, @Req() req: RequestWithId): Promise<BoardEntity> {
    return this.boardsService.createBoard(input, req.user!.sub, req.requestId);
  }

  @Patch(':boardId')
  updateBoard(
    @Param('boardId', ParseIntPipe) id: number,
    @Body() input: UpdateBoardDto,
    @Req() req: RequestWithId,
  ): Promise<BoardEntity> {
    return this.boardsService.updateBoard(id, input, req.user!.sub);
  }

  @Delete(':boardId')
  deleteBoard(@Param('boardId', ParseIntPipe) id: number, @Req() req: RequestWithId): Promise<{ success: true }> {
    return this.boardsService.deleteBoard(id, req.user!.sub);
  }

  @Get(':boardId/cards')
  listCards(@Param('boardId', ParseIntPipe) boardId: number, @Req() req: RequestWithId) {
    return this.boardsService.listCards(boardId, req.user!.sub);
  }

  @Post(':boardId/cards')
  createCard(
    @Param('boardId', ParseIntPipe) boardId: number,
    @Req() req: RequestWithId,
    @Body() input: CreateCardDto,
  ) {
    return this.boardsService.createCard(boardId, req.user!.sub, input);
  }

  @Patch(':boardId/cards/:cardId')
  updateCard(
    @Param('boardId', ParseIntPipe) boardId: number,
    @Param('cardId') cardId: string,
    @Req() req: RequestWithId,
    @Body() input: UpdateCardDto,
  ) {
    return this.boardsService.updateCard(boardId, cardId, req.user!.sub, input);
  }

  @Delete(':boardId/cards/:cardId')
  deleteCard(
    @Param('boardId', ParseIntPipe) boardId: number,
    @Param('cardId') cardId: string,
    @Req() req: RequestWithId,
  ) {
    return this.boardsService.deleteCard(boardId, cardId, req.user!.sub);
  }
}
