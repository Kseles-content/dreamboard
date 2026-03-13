import { Body, Controller, Get, Post } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UserEntity } from './user.entity';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  listUsers(): Promise<UserEntity[]> {
    return this.usersService.listUsers();
  }

  @Post()
  createUser(@Body() input: CreateUserDto): Promise<UserEntity> {
    return this.usersService.createUser(input);
  }
}
