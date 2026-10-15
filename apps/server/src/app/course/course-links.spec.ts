import { readFileSync } from 'fs';
import { join } from 'path';
import {
  COURSE_LINK_LABEL_LENGTH_MESSAGE,
  COURSE_LINK_LABEL_MESSAGE,
  COURSE_LINK_URL_MESSAGE,
  COURSE_LINKS_MAX_MESSAGE,
  CourseLinkError,
  normalizeCourseLinks,
  presentCourseLinks,
} from './course-links';

const structure = {
  label: 'Course structure',
  url: 'https://example.com/structure',
};
const syllabus = {
  label: 'Week outline',
  url: 'http://example.com/weeks',
};

describe('course links', () => {
  it('stores an empty list when links are omitted', () => {
    expect(normalizeCourseLinks(undefined)).toEqual([]);
    expect(normalizeCourseLinks(null)).toEqual([]);
    expect(normalizeCourseLinks([])).toEqual([]);
  });

  it('keeps the saved order and trims each label and url', () => {
    expect(
      normalizeCourseLinks([
        {
          label: '  Course structure  ',
          url: ' https://example.com/structure ',
        },
        { label: ' Week outline ', url: 'http://example.com/weeks' },
      ]),
    ).toEqual([structure, syllabus]);
  });

  it('rejects a missing name, a long name, and more than 10 links', () => {
    expect(() =>
      normalizeCourseLinks([{ label: '   ', url: structure.url }]),
    ).toThrow(COURSE_LINK_LABEL_MESSAGE);
    expect(() =>
      normalizeCourseLinks([{ label: 'a'.repeat(61), url: structure.url }]),
    ).toThrow(COURSE_LINK_LABEL_LENGTH_MESSAGE);
    expect(() =>
      normalizeCourseLinks(
        Array.from({ length: 11 }, () => ({ ...structure })),
      ),
    ).toThrow(COURSE_LINKS_MAX_MESSAGE);
    expect(() => normalizeCourseLinks([{ url: structure.url }])).toThrow(
      CourseLinkError,
    );
  });

  it('accepts 10 links and a 60-character name', () => {
    const links = Array.from({ length: 10 }, (_, index) => ({
      label: `${index}`.padEnd(60, 'x'),
      url: `https://example.com/${index}`,
    }));
    expect(normalizeCourseLinks(links)).toEqual(links);
  });

  it('rejects anything that is not an absolute http or https url', () => {
    const bad = [
      'javascript:alert(1)',
      'data:text/html,hi',
      'ftp://example.com/file',
      '/structure',
      'example.com/structure',
      'https://',
      `https://example.com/${'a'.repeat(2000)}`,
    ];
    for (const url of bad) {
      expect(() => normalizeCourseLinks([{ label: 'Structure', url }])).toThrow(
        COURSE_LINK_URL_MESSAGE,
      );
    }
    expect(
      normalizeCourseLinks([
        { label: 'Structure', url: `https://example.com/${'a'.repeat(1979)}` },
      ])[0].url.length,
    ).toBeLessThanOrEqual(2000);
  });

  it('presents stored links in order and drops a broken row', () => {
    expect(
      presentCourseLinks([
        structure,
        { label: ' ', url: structure.url },
        syllabus,
        null,
      ]),
    ).toEqual([structure, syllabus]);
    expect(presentCourseLinks(null)).toEqual([]);
  });

  it('adds a jsonb column and returns links on the public course', () => {
    const migration = readFileSync(
      join(
        __dirname,
        '../../../../../libs/shared/src/database/migrations/1735690700000-CourseLinks.ts',
      ),
      'utf8',
    );
    expect(migration).toContain('"links" jsonb NOT NULL DEFAULT \'[]\'');
    expect(migration).not.toMatch(/INSERT INTO/i);
    const database = readFileSync(
      join(
        __dirname,
        '../../../../../libs/shared/src/database/database.module.ts',
      ),
      'utf8',
    );
    expect(database).toContain('CourseLinks1735690700000');

    const service = readFileSync(join(__dirname, 'course.service.ts'), 'utf8');
    const entity = readFileSync(
      join(__dirname, 'entities/course.entity.ts'),
      'utf8',
    );
    const dto = readFileSync(join(__dirname, 'dto/course.dto.ts'), 'utf8');
    expect(service).not.toContain('courseStructureUrl');
    expect(entity).not.toContain('courseStructureUrl');
    expect(dto).not.toContain('courseStructureUrl');
    expect(entity).toContain('links: CourseLink[] = []');

    const publicDto = service.slice(
      service.indexOf('private async toPublicDto('),
      service.indexOf('private async toAdminDto('),
    );
    expect(publicDto).toContain('links: presentCourseLinks(row.links)');
    expect(publicDto).toContain('...courseMediaFields(row)');
    expect(publicDto).not.toContain('afterPaymentEmail');

    const create = service.slice(
      service.indexOf('async create('),
      service.indexOf('async update('),
    );
    expect(create).toContain('normalizeCourseLinks(dto.links)');
    const update = service.slice(
      service.indexOf('async update('),
      service.indexOf('async remove('),
    );
    expect(update).toContain('dto.links !== undefined');
    expect(update).toContain('normalizeCourseLinks(dto.links)');
    expect(dto).toContain('links?: CourseLinkDto[] | null');
    expect(dto).toContain('COURSE_LINK_URL_MESSAGE');
  });
});
