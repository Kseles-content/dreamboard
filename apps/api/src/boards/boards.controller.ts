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
}
