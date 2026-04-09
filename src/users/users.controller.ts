import { Body, Controller, Get, Post } from '@nestjs/common';
import { User } from '@prisma/client';
import { CreateUserDto } from './dto/create-user.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  listUsers(): Promise<User[]> {
    return this.usersService.listUsers();
  }

  @Post()
  createUser(@Body() input: CreateUserDto): Promise<User> {
    return this.usersService.createUser(input);
  }
}
