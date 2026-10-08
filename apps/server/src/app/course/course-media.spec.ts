import { readFileSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import {
  CourseMediaError,
  courseMediaFields,
  normalizeSyllabusText,
  prepareCourseImage,
  prepareCourseSyllabusPdf,
} from './course-media';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('course image and syllabus fields', () => {
  it('exposes a null image and syllabus until an admin adds them', () => {
    expect(
      courseMediaFields({
        imageUrl: null,
        syllabusUrl: '  ',
        syllabusFilename: null,
        syllabusText: null,
      }),
    ).toEqual({
      imageUrl: null,
      syllabus: { url: null, filename: null, text: null },
    });
    expect(
      courseMediaFields({
        imageUrl: ' https://cdn.example/course.jpg ',
        syllabusUrl: 'https://cdn.example/syllabus.pdf',
        syllabusFilename: 'syllabus.pdf',
        syllabusText: '<p>Week 1</p>',
      }),
    ).toEqual({
      imageUrl: 'https://cdn.example/course.jpg',
      syllabus: {
        url: 'https://cdn.example/syllabus.pdf',
        filename: 'syllabus.pdf',
        text: '<p>Week 1</p>',
      },
    });
  });

  it('accepts png and jpeg and rejects other types and oversized images', async () => {
    const prepared = await prepareCourseImage({
      buffer: PNG,
      originalname: 'Robotics.PNG',
      mimetype: 'image/png',
      size: PNG.length,
    });
    expect(prepared.mimetype).toBe('image/png');
    expect(prepared.buffer.length).toBeGreaterThan(0);

    const jpeg = await sharp(PNG).jpeg().toBuffer();
    const asJpeg = await prepareCourseImage({
      buffer: jpeg,
      originalname: 'cover.png',
      mimetype: 'image/jpeg',
      size: jpeg.length,
    });
    expect(asJpeg.mimetype).toBe('image/jpeg');
    expect(asJpeg.originalname.endsWith('.jpg')).toBe(true);

    const webp = await sharp(PNG).webp().toBuffer();
    const asWebp = await prepareCourseImage({
      buffer: webp,
      originalname: 'cover.webp',
      mimetype: 'image/webp',
      size: webp.length,
    });
    expect(asWebp.mimetype).toBe('image/webp');

    await expect(
      prepareCourseImage({
        buffer: Buffer.from('%PDF-1.4'),
        originalname: 'notes.png',
        mimetype: 'image/png',
        size: 8,
      }),
    ).rejects.toThrow('Image must be jpeg, png, or webp');

    await expect(
      prepareCourseImage({
        buffer: PNG,
        originalname: 'anim.gif',
        mimetype: 'image/gif',
        size: PNG.length,
      }),
    ).rejects.toBeInstanceOf(CourseMediaError);

    await expect(prepareCourseImage(undefined)).rejects.toThrow(
      'File is required',
    );

    const huge = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]);
    await expect(
      prepareCourseImage({
        buffer: huge,
        originalname: 'big.png',
        mimetype: 'image/png',
        size: huge.length,
      }),
    ).rejects.toThrow('Image exceeds 5MB');
  });

  it('accepts a real pdf and keeps a display file name', () => {
    const pdf = Buffer.from('%PDF-1.7\n1 0 obj\nendobj\n');
    const prepared = prepareCourseSyllabusPdf({
      buffer: pdf,
      originalname: 'Week Plan (2026).pdf',
      mimetype: 'application/pdf',
      size: pdf.length,
    });
    expect(prepared.mimetype).toBe('application/pdf');
    expect(prepared.originalname).toBe('Week Plan (2026).pdf');

    expect(() =>
      prepareCourseSyllabusPdf({
        buffer: PNG,
        originalname: 'photo.pdf',
        mimetype: 'application/pdf',
        size: PNG.length,
      }),
    ).toThrow(CourseMediaError);
  });

  it('keeps week-by-week markup and strips scripts and javascript links', () => {
    const clean = normalizeSyllabusText(`
      <h2>Week 1</h2>
      <p>Sensors &amp; boards</p>
      <ul><li>GPIO</li></ul>
      <a href="https://example.com/notes" onclick="alert(1)">notes</a>
      <script>alert(1)</script>
      <img src="x" onerror="alert(1)">
      <a href="javascript:alert(1)">bad</a>
      <a href="&#106;avascript:alert(1)">also bad</a>
    `);
    expect(clean).toContain('<h2>Week 1</h2>');
    expect(clean).toContain('<li>GPIO</li>');
    expect(clean).toContain('href="https://example.com/notes"');
    expect(clean).toContain('rel="noopener noreferrer"');
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('onerror');
    expect(clean).not.toContain('onclick');
    expect(clean).not.toContain('javascript');
    expect(clean).not.toContain('<img');
    expect(normalizeSyllabusText('   ')).toBeNull();
    expect(normalizeSyllabusText(null)).toBeNull();
    expect(normalizeSyllabusText('<script>alert(1)</script>')).toBeNull();
    expect(() => normalizeSyllabusText('x'.repeat(50_001))).toThrow(
      CourseMediaError,
    );
  });

  it('adds nullable columns and does not insert courses', () => {
    const migration = readFileSync(
      join(
        __dirname,
        '../../../../../libs/shared/src/database/migrations/1735690400000-CourseImageSyllabus.ts',
      ),
      'utf8',
    );
    expect(migration).toContain('"image_url"');
    expect(migration).toContain('"syllabus_url"');
    expect(migration).toContain('"syllabus_filename"');
    expect(migration).toContain('"syllabus_text"');
    expect(migration).not.toMatch(/INSERT INTO/i);
    const database = readFileSync(
      join(
        __dirname,
        '../../../../../libs/shared/src/database/database.module.ts',
      ),
      'utf8',
    );
    expect(database).toContain('CourseImageSyllabus1735690400000');
  });

  it('returns imageUrl and syllabus on public courses and still soft-deletes', () => {
    const service = readFileSync(join(__dirname, 'course.service.ts'), 'utf8');
    const controller = readFileSync(
      join(__dirname, 'course.controller.ts'),
      'utf8',
    );
    const publicDto = service.slice(
      service.indexOf('private async toPublicDto('),
      service.indexOf('private async toAdminDto('),
    );
    expect(publicDto).toContain('...courseMediaFields(row)');
    expect(publicDto).not.toContain('afterPaymentEmail');
    const adminDto = service.slice(
      service.indexOf('private async toAdminDto('),
    );
    expect(adminDto).toContain('afterPaymentEmail');

    const detail = service.slice(
      service.indexOf('async getPublic('),
      service.indexOf('async listAdmin('),
    );
    expect(detail).toContain('isEnrollable');
    expect(detail).toContain('NotFoundException');
    expect(detail).toContain('this.toPublicDto(row)');

    const image = service.slice(
      service.indexOf('async setImage('),
      service.indexOf('async clearImage('),
    );
    expect(image).toContain(
      "this.storage.uploadFile(prepared, 'courses/images')",
    );
    expect(image).toContain('this.storage.deleteByPublicUrl(previous)');
    expect(image).toContain('fromMedia(() => prepareCourseImage(file))');

    const pdf = service.slice(
      service.indexOf('async setSyllabusFile('),
      service.indexOf('async clearSyllabusFile('),
    );
    expect(pdf).toContain(
      "this.storage.uploadFile(prepared, 'courses/syllabi')",
    );
    expect(pdf).toContain('row.syllabusFilename = prepared.originalname');

    const text = service.slice(
      service.indexOf('async setSyllabusText('),
      service.indexOf('async clearSyllabusText('),
    );
    expect(text).toContain('normalizeSyllabusText(text)');

    const detach = service.slice(
      service.indexOf('private async softRemoveCourses('),
      service.indexOf('private async coursesInProgram('),
    );
    expect(detach).toContain('await manager.softRemove(rows)');
    expect(detach).toContain('await this.deleteStoredMedia(rows)');
    expect(detach).not.toContain('this.enrollments.delete');
    expect(detach).not.toContain('this.enrollments.softRemove');

    expect(controller).toContain("@Post('admin/courses/:id/image')");
    expect(controller).toContain("@Delete('admin/courses/:id/image')");
    expect(controller).toContain("@Post('admin/courses/:id/syllabus')");
    expect(controller).toContain("@Delete('admin/courses/:id/syllabus')");
    expect(controller).toContain("@Patch('admin/courses/:id/syllabus/text')");
    expect(controller).toContain("@Get('enter-first/courses/:slug')");
  });
});
