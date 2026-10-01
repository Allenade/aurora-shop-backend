import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Action, Resource } from '@app/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { UpdateOrganizationSettingsDto } from './dto/organization-settings.dto';
import { OrgSettingsService } from './org-settings.service';

@ApiTags('Organization Settings')
@ApiBearerAuth()
@Controller('admin/settings')
export class OrgSettingsController {
  constructor(private readonly settings: OrgSettingsService) {}

  @Get('organization')
  @RequirePermissions({ action: Action.READ, resource: Resource.COMPLIANCE })
  @ApiOperation({
    operationId: 'getOrganizationSettings',
    summary: 'Get organization and retention settings',
  })
  get() {
    return this.settings.get();
  }

  @Patch('organization')
  @RequirePermissions({ action: Action.MANAGE, resource: Resource.SETTINGS })
  @ApiOperation({
    operationId: 'updateOrganizationSettings',
    summary: 'Update organization and retention settings',
    description:
      'Super admin only. Covers retention, legal entity, and policy versions/URLs.',
  })
  update(
    @Body() body: UpdateOrganizationSettingsDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.settings.update(body, userId);
  }
}
