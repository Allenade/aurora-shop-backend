import { Controller, Delete, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Action, Resource } from '@app/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { UserService } from './user.service';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('admin/users')
export class AdminUserController {
  constructor(private readonly users: UserService) {}

  @Delete(':id')
  @RequirePermissions({ action: Action.MANAGE, resource: Resource.ALL })
  @ApiOperation({
    operationId: 'deleteAdminUser',
    summary: 'Delete user',
    description:
      'Super admin only. Soft-deletes the user, revokes their sessions, and clears their cart. Refuses the signed-in account and the last remaining super admin. Orders, payments, and course enrollments are kept. Returns 404 when the user does not exist and 403 when the delete is not allowed.',
  })
  remove(@Param('id') id: string, @CurrentUser('sub') actorId: string) {
    return this.users.remove(id, actorId);
  }
}
