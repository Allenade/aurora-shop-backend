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
import { PublicEndpointThrottlerGuard } from '../../common/http/public-throttler.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
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
  @UseGuards(PublicEndpointThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('enter-first/courses')
  @ApiOperation({
    operationId: 'listEnterFirstCourses',
    summary: 'Public Core 3.0 courses',
    description:
      'Published courses that are free or have a price set. Draft, closed, archived, and paid courses with no price are omitted. The enroll endpoint ignores any client-supplied amount.',
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
  })
  listAdmin() {
    return this.courses.listAdmin();
  }

  @ApiBearerAuth()
  @Post('admin/courses/reorder')
  @RequirePermissions({ action: Action.UPDATE, resource: Resource.COURSE })
  @ApiOperation({
    operationId: 'reorderCourses',
    summary: 'Reorder courses',
  })
  reorder(@Body() body: ReorderCoursesDto, @CurrentUser('sub') userId: string) {
    return this.courses.reorder(body, userId);
  }

  @ApiBearerAuth()
  @Post('admin/courses')
  @RequirePermissions({ action: Action.CREATE, resource: Resource.COURSE })
  @ApiOperation({
    operationId: 'createCourse',
    summary: 'Create course',
    description:
      'Price is optional and is never defaulted. Publishing (status open) a paid course without a price returns 400. Mark the course free or set a price first.',
  })
  create(@Body() body: UpsertCourseDto, @CurrentUser('sub') userId: string) {
    return this.courses.create(body, userId);
  }

  @ApiBearerAuth()
  @Get('admin/courses/:id')
  @RequirePermissions({ action: Action.READ, resource: Resource.COURSE })
  @ApiOperation({
    operationId: 'getAdminCourse',
    summary: 'Get course',
  })
  get(@Param('id') id: string) {
    return this.courses.getAdmin(id);
  }

  @ApiBearerAuth()
  @Patch('admin/courses/:id')
  @RequirePermissions({ action: Action.UPDATE, resource: Resource.COURSE })
  @ApiOperation({
    operationId: 'updateCourse',
    summary: 'Update course',
    description:
      'Price changes are appended to course_price_history. Publishing a paid course without a price returns 400.',
  })
  update(
    @Param('id') id: string,
    @Body() body: UpdateCourseDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.courses.update(id, body, userId);
  }

  @ApiBearerAuth()
  @Post('admin/courses/:id/archive')
  @RequirePermissions({ action: Action.UPDATE, resource: Resource.COURSE })
  @ApiOperation({
    operationId: 'archiveCourse',
    summary: 'Archive course',
    description: 'Allowed only when the course already has enrollments.',
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
    description: 'Only drafts with zero enrollments can be deleted.',
  })
  remove(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.courses.remove(id, userId);
  }
}
