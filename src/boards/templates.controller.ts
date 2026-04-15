import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestWithId } from '../common/request-with-id';
import { BoardsService } from './boards.service';

@UseGuards(JwtAuthGuard)
@Controller('v1/templates')
export class TemplatesController {
  constructor(private readonly boardsService: BoardsService) {}

  @Get()
  listTemplates(@Req() req: RequestWithId) {
    return this.boardsService.listTemplates(req.user!.sub);
  }
}
