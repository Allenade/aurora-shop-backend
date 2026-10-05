import { coursesForProgram } from './course-catalogue';
import { CORE_30_PROGRAM } from '../program/core30';

describe('course catalogue for compliance and payment', () => {
  it('returns no options when the course table has no rows', () => {
    expect(coursesForProgram([], CORE_30_PROGRAM)).toEqual([]);
  });

  it('returns only courses stored in the requested program', () => {
    const rows = [
      { slug: 'robotics', program: 'Core 3.0' },
      { slug: 'shop-kit', program: 'Other' },
    ];
    expect(
      coursesForProgram(rows, CORE_30_PROGRAM).map((row) => row.slug),
    ).toEqual(['robotics']);
  });

  it('does not substitute a built-in track list', () => {
    const selected = coursesForProgram(
      [{ slug: 'custom-track', program: 'Core 3.0' }],
      CORE_30_PROGRAM,
    );
    expect(selected).toEqual([{ slug: 'custom-track', program: 'Core 3.0' }]);
    expect(selected.map((row) => row.slug)).not.toContain('iot');
  });
});
