const effectCallbacks: Array<() => void | (() => void)> = [];

jest.mock('react', () => ({
  __esModule: true,
  useEffect: jest.fn((callback: () => void | (() => void)) => {
    effectCallbacks.push(callback);
  }),
  useCallback: jest.fn((fn: unknown) => fn),
  useRef: jest.fn((initialValue: unknown) => ({ current: initialValue }))}));

jest.mock('@/services', () => ({
  authService: {
    refreshToken: jest.fn(),
    setAuthToken: jest.fn(),
    clearStoredUser: jest.fn()}}));

import { useTokenManager } from './useTokenManager';
import { authService } from '@/services';
import { STORAGE_KEYS } from '@/constants';

function createJwt(exp: number): string {
  const payload = {
    sub: '1',
    device_id: null,
    exp,
    iat: exp - 3600,
    role: 'user',
    username: 'tester'};

  return `header.${btoa(JSON.stringify(payload))}.signature`;
}

describe('useTokenManager timers and refresh behavior', () => {
  const storage = new Map<string, string>();
  const mockedAuthService = authService as jest.Mocked<typeof authService>;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    effectCallbacks.length = 0;
    storage.clear();

    const storageMock = {
      getItem: jest.fn((key: string) => storage.get(key) ?? null),
      setItem: jest.fn((key: string, value: string) => {
        storage.set(key, value);
      }),
      removeItem: jest.fn((key: string) => {
        storage.delete(key);
      }),
      clear: jest.fn(() => storage.clear())};
    Object.defineProperty(window, 'localStorage', {
      value: storageMock,
      configurable: true});
    Object.defineProperty(global, 'localStorage', {
      value: storageMock,
      configurable: true});

    mockedAuthService.refreshToken.mockReset();
    mockedAuthService.setAuthToken.mockReset();
    mockedAuthService.clearStoredUser.mockReset();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('schedules refresh 2 minutes before token expiry on init', async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const token = createJwt(nowSeconds + 600);
    storage.set(STORAGE_KEYS.AUTH_TOKEN, token);

    const timeoutSpy = jest.spyOn(global, 'setTimeout');

    useTokenManager();
    effectCallbacks[0]?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(timeoutSpy).toHaveBeenCalled();
    expect(Number(timeoutSpy.mock.calls[0][1])).toBe(480000);

    timeoutSpy.mockRestore();
  });

  it('refreshes and re-schedules when timer fires and refresh succeeds', async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const initialToken = createJwt(nowSeconds + 180);
    const refreshedToken = createJwt(nowSeconds + 360);
    storage.set(STORAGE_KEYS.AUTH_TOKEN, refreshedToken);

    mockedAuthService.refreshToken.mockResolvedValue({
      success: true,
      data: { token: refreshedToken }});
    mockedAuthService.setAuthToken.mockImplementation((token: string) => {
      storage.set(STORAGE_KEYS.AUTH_TOKEN, token);
    });

    const timeoutSpy = jest.spyOn(global, 'setTimeout');

    const manager = useTokenManager();
    manager.scheduleTokenRefresh(initialToken);

    expect(Number(timeoutSpy.mock.calls[0][1])).toBe(60000);

    jest.advanceTimersByTime(60000);
    await Promise.resolve();
    await Promise.resolve();

    expect(mockedAuthService.refreshToken).toHaveBeenCalledTimes(1);
    expect(mockedAuthService.setAuthToken).toHaveBeenCalledWith(refreshedToken);
    expect(timeoutSpy).toHaveBeenCalledTimes(2);
    expect(Number(timeoutSpy.mock.calls[1][1])).toBe(180000);

    timeoutSpy.mockRestore();
  });

  it('clears user data when timer refresh fails', async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const token = createJwt(nowSeconds + 180);
    storage.set(STORAGE_KEYS.AUTH_TOKEN, token);

    mockedAuthService.refreshToken.mockResolvedValue({
      success: false,
      error: {
        error: 'Unauthorized',
        details: 'refresh failed',
        timestamp: new Date().toISOString()}});

    useTokenManager();
    effectCallbacks[0]?.();
    await Promise.resolve();
    await Promise.resolve();

    jest.advanceTimersByTime(60000);
    await Promise.resolve();
    await Promise.resolve();

    expect(mockedAuthService.clearStoredUser).toHaveBeenCalled();
    expect(localStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEYS.AUTH_TOKEN);
  });
});
