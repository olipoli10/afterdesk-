import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({ configure: vi.fn((options: unknown) => ({ options })), sendEmail: vi.fn(), fetch: vi.fn() }));
vi.mock('better-auth', () => ({ betterAuth: fake.configure }));
vi.mock('better-auth/plugins', () => ({ emailOTP: vi.fn(() => ({ id: 'peer-otp' })) }));
vi.mock('better-auth/adapters/prisma', () => ({ prismaAdapter: vi.fn(() => ({ id: 'peer-database-double' })) }));
vi.mock('@better-auth/expo', () => ({ expo: vi.fn(() => ({ id: 'peer-expo' })) }));
vi.mock('@/lib/db', () => ({ prisma: {} }));
vi.mock('@/lib/email', () => ({ sendEmail: fake.sendEmail }));

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); vi.stubGlobal('fetch', fake.fetch);
  const env = {
    NODE_ENV: 'production', BETTER_AUTH_SECRET: 'synthetic-peer-auth-secret-not-real', BETTER_AUTH_URL: 'https://peer.invalid',
    ENDVERA_EXTERNAL_TRANSPORT_ENABLED: 'ENABLED', ENDVERA_GOOGLE_OAUTH_ENABLED: 'ENABLED',
    ENDVERA_EXTERNAL_AUTHORITY_REF: 'synthetic-authority', ENDVERA_EXTERNAL_OWNER_REF: 'synthetic-owner',
    GOOGLE_CLIENT_ID: 'synthetic-calendar-only-client', GOOGLE_CLIENT_SECRET: 'synthetic-calendar-only-secret',
    ENDVERA_EMAIL_PROVIDER_ENABLED: 'DISABLED',
  };
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  vi.stubEnv('ENDVERA_GOOGLE_SIGN_IN_ENABLED', undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('peer Google login separation — captured initialization, no live auth/provider', () => {
  it('ignores public lookalike flags in production and preserves non-social sign-in configuration', async () => {
    vi.stubEnv('NEXT_PUBLIC_ENDVERA_GOOGLE_SIGN_IN_ENABLED', 'ENABLED');
    vi.stubEnv('EXPO_PUBLIC_ENDVERA_GOOGLE_SIGN_IN_ENABLED', 'ENABLED');
    const auth = await import('../src/lib/auth');
    expect(auth.googleEnabled).toBe(false); expect(auth.emailSignupEnabled).toBe(false);
    const options = fake.configure.mock.calls[0][0];
    expect(options).not.toHaveProperty('socialProviders'); expect(options).not.toHaveProperty('account');
    expect(options).toHaveProperty('emailAndPassword', { enabled: true, minPasswordLength: 10, autoSignIn: true });
    expect(fake.sendEmail).not.toHaveBeenCalled(); expect(fake.fetch).not.toHaveBeenCalled();
  });
  it('documents actual initialization-time behavior rather than claiming immediate environment revocation', async () => {
    const disabled = await import('../src/lib/auth'); expect(disabled.googleEnabled).toBe(false);
    vi.stubEnv('ENDVERA_GOOGLE_SIGN_IN_ENABLED', 'ENABLED');
    expect((await import('../src/lib/auth')).googleEnabled).toBe(false);
    vi.resetModules();
    const enabled = await import('../src/lib/auth'); expect(enabled.googleEnabled).toBe(true);
    expect(fake.configure.mock.calls[1][0]).toHaveProperty('account.accountLinking.requireLocalEmailVerified', true);
    vi.stubEnv('ENDVERA_GOOGLE_SIGN_IN_ENABLED', 'DISABLED');
    expect((await import('../src/lib/auth')).googleEnabled).toBe(true);
    vi.resetModules();
    expect((await import('../src/lib/auth')).googleEnabled).toBe(false);
    expect(fake.configure).toHaveBeenCalledTimes(3); expect(fake.fetch).not.toHaveBeenCalled();
  });
  it('does not weaken the production auth-secret boot requirement when social sign-in is absent', async () => {
    vi.stubEnv('BETTER_AUTH_SECRET', undefined);
    await expect(import('../src/lib/auth')).rejects.toThrow('BETTER_AUTH_SECRET must be set in production.');
    expect(fake.configure).not.toHaveBeenCalled(); expect(fake.fetch).not.toHaveBeenCalled();
  });
});
