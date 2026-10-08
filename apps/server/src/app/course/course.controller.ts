import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Action, Resource } from '@app/shared';
import { PublicEndpointThrottlerGuard } from '../../common/http/public-throttler.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CORE_30_PROGRAM, resolveProgram } from '../program/core30';
import type { FileUploadPayload } from '../storage/storage.service';
import {
  COURSE_IMAGE_MAX_BYTES,
  COURSE_SYLLABUS_PDF_MAX_BYTES,
} from './course-media';
import { CourseService } from './course.service';
import {
  ReorderCoursesDto,
  UpdateCourseDto,
  UpdateCourseSyllabusTextDto,
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
      'Published Core 3.0 courses loaded from the course table. Only courses created in the compliance dashboard and then published are returned. There is no built-in course list. Draft, closed, archived, and paid courses with no price are omitted. Each course includes imageUrl and syllabus (url, filename, text), which are null until an admin uploads them. The enroll endpoint ignores any client-supplied amount.',
  })
  listPublic() {
    return this.courses.listPublic(CORE_30_PROGRAM);
  }

  @Public()
  @UseGuards(PublicEndpointThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('enter-first/courses/:slug')
  @ApiOperation({
    operationId: 'getEnterFirstCourse',
    summary: 'Public Core 3.0 course',
    description:
      'One published Core 3.0 course by slug, including imageUrl and syllabus. Draft, closed, archived, and paid courses with no price return 404.',
  })
  getPublic(@Param('slug') slug: string) {
    return this.courses.getPublic(slug);
  }

  @ApiBearerAuth()
  @Get('admin/courses')
  @RequirePermissions({ action: Action.LIST, resource: Resource.COURSE })
  @ApiOperation({
    operationId: 'listAdminCourses',
    summary: 'List courses',
    description:
      'Courses stored in the course table for one program. Defaults to Core 3.0. Used for course management and for enrollment or payment course filters. Returns an empty list when no courses have been created. Prices come from each row. Each course includes imageUrl and syllabus (url, filename, text).',
  })
  listAdmin(@Query('program') program?: string) {
    return this.courses.listAdmin(resolveProgram(program));
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
  @Post('admin/courses/clear-all')
  @RequirePermissions({ action: Action.MANAGE, resource: Resource.ALL })
  @ApiOperation({
    operationId: 'clearAllCourses',
    summary: 'Soft-delete every course',
    description:
      'Super admin only. Soft-deletes every course in the catalogue, including courses people have paid for. Price history is soft-removed with each course. Enrollment and payment rows are left in place and still store each course slug. Does not create or seed courses and does not refund payments.',
  })
  clearAll(@CurrentUser('sub') userId: string) {
    return this.courses.clearAll(userId);
  }

  @ApiBearerAuth()
  @Post('admin/courses')
  @RequirePermissions({ action: Action.CREATE, resource: Resource.COURSE })
  @ApiOperation({
    operationId: 'createCourse',
    summary: 'Create course',
    description:
      'Price is optional and is never defaulted. Publishing (status open) a paid course without a price returns 400. Mark the course free or set a price first. afterPaymentEmail is optional sanitized HTML (the joining link) stored for the admin and omitted from public course responses.',
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
    summary: 'Delete course',
    description:
      'Soft-deletes the course in any status, including when people have paid or registered. Price history is soft-removed with the course. Enrollment and payment rows are kept and still store the course slug. Nothing is refunded. The course leaves the catalogue.',
  })
  remove(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.courses.remove(id, userId);
  }

  @ApiBearerAuth()
  @Post('admin/courses/:id/image')
  @RequirePermissions({ action: Action.UPDATE, resource: Resource.COURSE })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: COURSE_IMAGE_MAX_BYTES } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({
    operationId: 'uploadCourseImage',
    summary: 'Upload or replace the course image',
    description:
      'jpeg, png, or webp up to 5MB. Stored on the same Cloudflare R2 bucket as email images. Replaces the previous picture.',
  })
  uploadImage(
    @Param('id') id: string,
    @UploadedFile() file: FileUploadPayload | undefined,
    @CurrentUser('sub') userId: string,
  ) {
    return this.courses.setImage(id, file, userId);
  }

  @ApiBearerAuth()
  @Delete('admin/courses/:id/image')
  @RequirePermissions({ action: Action.UPDATE, resource: Resource.COURSE })
  @ApiOperation({
    operationId: 'deleteCourseImage',
    summary: 'Remove the course image',
  })
  deleteImage(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.courses.clearImage(id, userId);
  }

  @ApiBearerAuth()
  @Post('admin/courses/:id/syllabus')
  @RequirePermissions({ action: Action.UPDATE, resource: Resource.COURSE })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: COURSE_SYLLABUS_PDF_MAX_BYTES },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({
    operationId: 'uploadCourseSyllabus',
    summary: 'Upload or replace the syllabus PDF',
    description:
      'PDF up to 10MB on Cloudflare R2. Replaces the previous PDF and leaves syllabus text in place.',
  })
  uploadSyllabus(
    @Param('id') id: string,
    @UploadedFile() file: FileUploadPayload | undefined,
    @CurrentUser('sub') userId: string,
  ) {
    return this.courses.setSyllabusFile(id, file, userId);
  }

  @ApiBearerAuth()
  @Delete('admin/courses/:id/syllabus/file')
  @RequirePermissions({ action: Action.UPDATE, resource: Resource.COURSE })
  @ApiOperation({
    operationId: 'deleteCourseSyllabusFile',
    summary: 'Remove the syllabus PDF',
    description: 'Leaves syllabus text in place.',
  })
  deleteSyllabusFile(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.courses.clearSyllabusFile(id, userId);
  }

  @ApiBearerAuth()
  @Patch('admin/courses/:id/syllabus/text')
  @RequirePermissions({ action: Action.UPDATE, resource: Resource.COURSE })
  @ApiOperation({
    operationId: 'updateCourseSyllabusText',
    summary: 'Set, replace, or clear syllabus text',
    description:
      'Rich text for week-by-week topics. Stored as sanitized HTML. Null or blank clears the text and leaves the PDF in place.',
  })
  updateSyllabusText(
    @Param('id') id: string,
    @Body() body: UpdateCourseSyllabusTextDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.courses.setSyllabusText(id, body.text, userId);
  }

  @ApiBearerAuth()
  @Delete('admin/courses/:id/syllabus/text')
  @RequirePermissions({ action: Action.UPDATE, resource: Resource.COURSE })
  @ApiOperation({
    operationId: 'deleteCourseSyllabusText',
    summary: 'Remove syllabus text',
    description: 'Leaves the syllabus PDF in place.',
  })
  deleteSyllabusText(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.courses.clearSyllabusText(id, userId);
  }

  @ApiBearerAuth()
  @Delete('admin/courses/:id/syllabus')
  @RequirePermissions({ action: Action.UPDATE, resource: Resource.COURSE })
  @ApiOperation({
    operationId: 'deleteCourseSyllabus',
    summary: 'Remove the syllabus PDF and text',
  })
  deleteSyllabus(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.courses.clearSyllabus(id, userId);
  }
}
