import { Controller, Get, Param } from '@nestjs/common';
import { BoardsService } from './boards.service';

@Controller('v1/share')
export class SharePublicController {
  constructor(private readonly boardsService: BoardsService) {}

  @Get(':token')
  getPublicBoard(@Param('token') token: string) {
    return this.boardsService.getPublicBoardByToken(token);
  }
}
