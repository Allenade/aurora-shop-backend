import { shouldSynchronizeSchema } from './env.config';

describe('schema synchronize', () => {
  const remote =
    'postgres://aurora:secret@ep-cool.neon.tech/aurora_shop?sslmode=require';
  const local = 'postgres://aurora:aurora@localhost:5432/aurora_shop';

  it('stays off for staging and production even when the flag is set', () => {
    expect(
      shouldSynchronizeSchema({
        nodeEnv: 'production',
        databaseUrl: remote,
        dbSynchronize: 'true',
      }),
    ).toBe(false);
    expect(
      shouldSynchronizeSchema({
        nodeEnv: 'production',
        databaseUrl: local,
        dbSynchronize: 'true',
      }),
    ).toBe(false);
    expect(
      shouldSynchronizeSchema({
        nodeEnv: 'development',
        databaseUrl: remote,
        dbSynchronize: 'true',
      }),
    ).toBe(false);
  });

  it('stays off in development unless DB_SYNCHRONIZE is explicitly true', () => {
    expect(
      shouldSynchronizeSchema({
        nodeEnv: 'development',
        databaseUrl: local,
        dbSynchronize: undefined,
      }),
    ).toBe(false);
    expect(
      shouldSynchronizeSchema({
        nodeEnv: 'development',
        databaseUrl: local,
        dbSynchronize: 'false',
      }),
    ).toBe(false);
  });

  it('allows synchronize only for an explicit local development database', () => {
    expect(
      shouldSynchronizeSchema({
        nodeEnv: 'development',
        databaseUrl: local,
        dbSynchronize: 'true',
      }),
    ).toBe(true);
    expect(
      shouldSynchronizeSchema({
        nodeEnv: 'development',
        databaseUrl: 'postgres://aurora:aurora@postgres:5432/aurora_shop',
        dbSynchronize: '1',
      }),
    ).toBe(true);
  });
});
