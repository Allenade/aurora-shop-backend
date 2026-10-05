import { enrollmentsToCsv } from './enrollment-csv';

describe('enrollment csv', () => {
  it('writes the stored program and tracks', () => {
    const csv = enrollmentsToCsv([
      {
        id: 'enr-1',
        firstName: 'Ada',
        lastName: 'Okafor',
        email: 'ada@example.com',
        phone: '+2348012345678',
        program: 'Core 3.0',
        tracks: ['robotics', 'vision'],
        amount: 25000,
        currency: 'NGN',
        paymentStatus: 'success',
        paystackReference: 'EF-1',
        marketingOptIn: false,
        isMinor: false,
        amountMismatch: false,
      },
    ]);
    const [header, row] = csv.split('\n');
    expect(header?.split(',')).toContain('program');
    expect(row).toContain('Core 3.0');
    expect(row).toContain('robotics|vision');
  });

  it('uses Core 3.0 when a row has a blank program', () => {
    const csv = enrollmentsToCsv([
      {
        id: 'enr-2',
        firstName: 'Ada',
        lastName: 'Okafor',
        email: 'ada@example.com',
        program: '  ',
        tracks: [],
        amount: 0,
        currency: 'NGN',
        paymentStatus: 'pending',
        marketingOptIn: false,
        amountMismatch: false,
      },
    ]);
    expect(csv).toContain('Core 3.0');
  });
});
