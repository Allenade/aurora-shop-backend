import {
  canonicalSelector,
  dedupeComposeRecipients,
  parseAgeGroup,
  parseSelector,
  type ComposeCandidate,
} from './recipient-selectors';

function row(
  partial: Partial<ComposeCandidate> & Pick<ComposeCandidate, 'email'>,
): ComposeCandidate {
  return {
    name: '',
    enrollmentId: null,
    courses: [],
    marketingOptIn: false,
    ...partial,
  };
}

describe('recipient selectors', () => {
  it('parses allPaid, course, age group, and student selectors', () => {
    expect(parseSelector('allPaid')).toEqual({ type: 'allPaid' });
    expect(
      parseSelector('course:11111111-1111-4111-8111-111111111111'),
    ).toEqual({
      type: 'course',
      courseId: '11111111-1111-4111-8111-111111111111',
    });
    expect(parseSelector('ageGroup:13-17')).toEqual({
      type: 'ageGroup',
      min: 13,
      max: 17,
    });
    expect(parseSelector('ageGroup:18+')).toEqual({
      type: 'ageGroup',
      min: 18,
      max: 130,
    });
    expect(parseSelector('ageGroup:min=13,max=17')).toEqual({
      type: 'ageGroup',
      min: 13,
      max: 17,
    });
    expect(parseSelector('student:ada@example.com')).toEqual({
      type: 'student',
      email: 'ada@example.com',
    });
    expect(
      parseSelector('student:22222222-2222-4222-8222-222222222222'),
    ).toEqual({
      type: 'student',
      enrollmentId: '22222222-2222-4222-8222-222222222222',
    });
    expect(parseAgeGroup('max:17,min:13')).toEqual({ min: 13, max: 17 });
    expect(parseSelector('email:  Ada.Okoye@Gmail.com ')).toEqual({
      type: 'email',
      email: 'ada.okoye@gmail.com',
    });
    expect(canonicalSelector('email:  Ada.Okoye@Gmail.com ')).toBe(
      'email:ada.okoye@gmail.com',
    );
  });

  it('rejects unknown selectors and inverted age ranges', () => {
    expect(() => parseSelector('everyone')).toThrow(/Unknown selector/);
    expect(() => parseSelector('course:iot')).toThrow(/course id/);
    expect(() => parseSelector('ageGroup:17-13')).toThrow(/Invalid age group/);
    expect(() => parseSelector('email:')).toThrow(/Invalid email address/);
    expect(() => parseSelector('email:not-an-email')).toThrow(
      /Invalid email address/,
    );
    expect(() => parseSelector('email:ada@mailinator.com')).toThrow(
      /Invalid email address/,
    );
  });

  it('de-duplicates a merged selector list by email and unions courses', () => {
    const merged = dedupeComposeRecipients([
      row({
        email: 'Ada@Example.com',
        name: 'Ada Lovelace',
        enrollmentId: 'enr-1',
        courses: ['Internet of Things'],
        marketingOptIn: false,
      }),
      row({
        email: 'ada@example.com',
        name: 'Ada',
        enrollmentId: 'enr-1',
        courses: ['Robotics'],
        marketingOptIn: true,
      }),
      row({
        email: 'chinedu@example.com',
        name: 'Chinedu Adeyemi',
        enrollmentId: 'enr-2',
        courses: ['Mobile'],
        marketingOptIn: true,
      }),
      row({
        email: 'ada@example.com',
        name: '',
        enrollmentId: null,
        courses: ['Internet of Things', 'AI'],
        marketingOptIn: false,
      }),
    ]);

    expect(merged).toHaveLength(2);
    const ada = merged.find((person) => person.email === 'ada@example.com');
    expect(ada).toEqual({
      email: 'ada@example.com',
      name: 'Ada Lovelace',
      enrollmentId: 'enr-1',
      courses: ['Internet of Things', 'Robotics', 'AI'],
      marketingOptIn: true,
    });
    expect(merged.map((person) => person.email)).toEqual([
      'ada@example.com',
      'chinedu@example.com',
    ]);
  });

  it('counts one person when an outside address is also a course student', () => {
    const merged = dedupeComposeRecipients([
      row({
        email: 'ada.okoye@gmail.com',
        name: '',
        enrollmentId: null,
        courses: [],
      }),
      row({
        email: 'Ada.Okoye@gmail.com',
        name: 'Ada Okoye',
        enrollmentId: 'enr-1',
        courses: ['Robotics'],
        marketingOptIn: true,
      }),
      row({
        email: 'ada.okoye@gmail.com',
        name: '',
        enrollmentId: null,
        courses: [],
      }),
    ]);
    expect(merged).toEqual([
      {
        email: 'ada.okoye@gmail.com',
        name: 'Ada Okoye',
        enrollmentId: 'enr-1',
        courses: ['Robotics'],
        marketingOptIn: true,
      },
    ]);
  });

  it('drops blank emails and keeps the first non-empty name', () => {
    const merged = dedupeComposeRecipients([
      row({ email: '   ', name: 'Nobody', courses: ['X'] }),
      row({ email: 'a@b.co', name: '', courses: ['One'] }),
      row({ email: 'A@b.co', name: 'Amina', courses: ['Two'] }),
    ]);
    expect(merged).toEqual([
      {
        email: 'a@b.co',
        name: 'Amina',
        enrollmentId: null,
        courses: ['One', 'Two'],
        marketingOptIn: false,
      },
    ]);
  });
});
