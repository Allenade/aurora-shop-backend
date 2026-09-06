import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Action, Resource, UserStatus } from '@app/shared';
import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { UserService } from './user.service';

class SetUserStatusDto {
  @IsEnum(UserStatus)
  @ApiProperty({ enum: UserStatus })
  status: UserStatus;
}

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UserController {
  constructor(private readonly users: UserService) {}

  @Get()
  @RequirePermissions({ action: Action.LIST, resource: Resource.USER })
  @ApiOperation({
    operationId: 'listUsers',
    summary: 'List Users',
    description: 'Admin user directory.',
  })
  list() {
    return this.users.list();
  }

  @Patch(':id/status')
  @RequirePermissions({ action: Action.MANAGE, resource: Resource.USER })
  @ApiOperation({
    operationId: 'setUserStatus',
    summary: 'Set Status',
    description: 'Activate or suspend a user.',
  })
  setStatus(@Param('id') id: string, @Body() dto: SetUserStatusDto) {
    return this.users.setStatus(id, dto.status);
  }
}
