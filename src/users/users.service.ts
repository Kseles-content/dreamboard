import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from './user.entity';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
  ) {}

  listUsers(): Promise<UserEntity[]> {
    return this.usersRepository.find({ order: { id: 'ASC' } });
  }

  async createUser(input: CreateUserDto): Promise<UserEntity> {
    const entity = this.usersRepository.create(input);
    return this.usersRepository.save(entity);
  }

  findById(id: number): Promise<UserEntity | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  findByEmail(email: string): Promise<UserEntity | null> {
    return this.usersRepository.findOne({ where: { email } });
  }
}
