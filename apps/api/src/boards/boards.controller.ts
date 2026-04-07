import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { BoardsService } from './boards.service';

@Controller('v1/boards')
export class BoardsController {
  constructor(private readonly boardsService: BoardsService) {}

  @Get()
  findAll() {
    return this.boardsService.findAll();
  }

  @Post()
  create(@Body() body: { title?: string; description?: string }) {
    return this.boardsService.create(body || {});
  }

  @Get(':boardId')
  findOne(@Param('boardId') boardId: string) {
    return this.boardsService.findOne(boardId);
  }

  @Patch(':boardId')
  update(
    @Param('boardId') boardId: string,
    @Body() body: { title?: string; description?: string },
  ) {
    return this.boardsService.update(boardId, body || {});
  }

  @Delete(':boardId')
  remove(@Param('boardId') boardId: string) {
    return this.boardsService.remove(boardId);
  }

  @Get(':boardId/cards')
  listCards(@Param('boardId') boardId: string) {
    return this.boardsService.listCards(boardId);
  }

  @Post(':boardId/cards')
  createCard(
    @Param('boardId') boardId: string,
    @Body() body: { type?: 'text'; text?: string },
  ) {
    return this.boardsService.createCard(boardId, body || {});
  }

  @Patch(':boardId/cards/:cardId')
  updateCard(
    @Param('boardId') boardId: string,
    @Param('cardId') cardId: string,
    @Body() body: { text?: string },
  ) {
    return this.boardsService.updateCard(boardId, cardId, body || {});
  }

  @Delete(':boardId/cards/:cardId')
  removeCard(@Param('boardId') boardId: string, @Param('cardId') cardId: string) {
    return this.boardsService.removeCard(boardId, cardId);
  }
}
