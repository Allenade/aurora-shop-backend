import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Action, Resource } from '@app/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { ClientIpThrottlerGuard } from '../../common/guards/client-ip-throttler.guard';
import { CourseService } from './course.service';
import {
  ReorderCoursesDto,
  UpdateCourseDto,
  UpsertCourseDto,
} from './dto/course.dto';

@ApiTags('Courses')
@Controller()
export class CourseController {
  constructor(private readonly courses: CourseService) {}

  @Public()
  @UseGuards(ClientIpThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('enter-first/courses')
  @ApiOperation({
    operationId: 'listPublicCourses',
    summary: 'Public course catalogue',
    description:
      'Open Core 3.0 tracks for the marketing site, including price, cutoff, and remaining seats.',
  })
  listPublic() {
    return this.courses.listPublic();
  }

  @ApiBearerAuth()
  @Get('admin/courses')
  @RequirePermissions({ action: Action.LIST, resource: Resource.COURSE })
  @ApiOperation({
    operationId: 'listAdminCourses',
    summary: 'List courses',
    description: 'All courses, including drafts and archived tracks.',
  })
  listAdmin() {
    return this.courses.listAdmin();
  }

  @ApiBearerAuth()
  @Get('admin/courses/:id')
  @RequirePermissions({ action: Action.READ, resource: Resource.COURSE })
  @ApiOperation({
    operationId: 'getAdminCourse',
    summary: 'Get course',
    description: 'Course detail including seats taken.',
  })
  get(@Param('id') id: string) {
    return this.courses.get(id);
  }

  @ApiBearerAuth()
  @Get('admin/courses/:id/price-history')
  @RequirePermissions({ action: Action.READ, resource: Resource.COURSE })
  @ApiOperation({
    operationId: 'listCoursePriceHistory',
    summary: 'Course price history',
    description: 'Who changed the price, when, and the previous amount.',
  })
  history(@Param('id') id: string) {
    return this.courses.priceHistory(id);
  }

  @ApiBearerAuth()
  @Post('admin/courses')
  @RequirePermissions({ action: Action.CREATE, resource: Resource.COURSE })
  @ApiOperation({
    operationId: 'createCourse',
    summary: 'Create course',
    description: 'Creates a course and the first price-history row.',
  })
  create(@Body() body: UpsertCourseDto, @CurrentUser('sub') userId: string) {
    return this.courses.create(body, userId);
  }

  @ApiBearerAuth()
  @Patch('admin/courses/:id')
  @RequirePermissions({ action: Action.UPDATE, resource: Resource.COURSE })
  @ApiOperation({
    operationId: 'updateCourse',
    summary: 'Update course',
    description:
      'Updates a course. Price changes are written to price history.',
  })
  update(
    @Param('id') id: string,
    @Body() body: UpdateCourseDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.courses.update(id, body, userId);
  }

  @ApiBearerAuth()
  @Post('admin/courses/reorder')
  @RequirePermissions({ action: Action.UPDATE, resource: Resource.COURSE })
  @ApiOperation({
    operationId: 'reorderCourses',
    summary: 'Reorder courses',
    description: 'Sets sortOrder from the ids array index.',
  })
  reorder(@Body() body: ReorderCoursesDto, @CurrentUser('sub') userId: string) {
    return this.courses.reorder(body.ids, userId);
  }

  @ApiBearerAuth()
  @Post('admin/courses/:id/archive')
  @RequirePermissions({ action: Action.UPDATE, resource: Resource.COURSE })
  @ApiOperation({
    operationId: 'archiveCourse',
    summary: 'Archive course',
    description: 'Archives a course that already has enrollments.',
  })
  archive(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.courses.archive(id, userId);
  }

  @ApiBearerAuth()
  @Delete('admin/courses/:id')
  @RequirePermissions({ action: Action.DELETE, resource: Resource.COURSE })
  @ApiOperation({
    operationId: 'deleteCourse',
    summary: 'Delete draft course',
    description: 'Deletes a draft course that has no enrollments.',
  })
  remove(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.courses.remove(id, userId);
  }
}
