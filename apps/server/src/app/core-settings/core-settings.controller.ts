import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Action, Resource } from '@app/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CoreSettingsService } from './core-settings.service';
import { UpdateCoreSettingsDto } from './dto/update-core-settings.dto';

@ApiTags('Core Settings')
@ApiBearerAuth()
@Controller('admin/settings')
export class CoreSettingsController {
  constructor(private readonly settings: CoreSettingsService) {}

  @Get()
  @RequirePermissions({ action: Action.READ, resource: Resource.SETTINGS })
  @ApiOperation({
    operationId: 'getCoreSettings',
    summary: 'Get compliance settings',
    description:
      'Retention periods, legal entity, and policy version URLs used by Core 3.0.',
  })
  get() {
    return this.settings.get();
  }

  @Patch()
  @RequirePermissions({ action: Action.UPDATE, resource: Resource.SETTINGS })
  @ApiOperation({
    operationId: 'updateCoreSettings',
    summary: 'Update compliance settings',
    description:
      'Partial update of retention, legal identity, and policy pages.',
  })
  update(
    @Body() body: UpdateCoreSettingsDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.settings.update(body, userId);
  }
}
