import { STORAGE_KEYS } from '@/constants';

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: jest.fn()},
  create: jest.fn()}));

jest.mock('sonner', () => ({
  toast: {
    error: jest.fn()}}));

type MockClient = jest.Mock & {
  interceptors: {
    request: { use: jest.Mock };
    response: { use: jest.Mock };
  };
  post: jest.Mock;
};

function createMockAxiosClient() {
  const requestInterceptors: Array<(config: any) => any> = [];
  const responseInterceptors: Array<{
    onFulfilled?: (value: any) => any;
    onRejected?: (error: any) => any;
  }> = [];

  let transport = async (_config: any) => ({ data: {} });

  const client = jest.fn(async (config: any) => {
    let nextConfig = {
      ...(config ?? {}),
      headers: config?.headers ?? {}};

    for (const interceptor of requestInterceptors) {
      nextConfig = await interceptor(nextConfig);
    }

    try {
      let response = await transport(nextConfig);
      for (const interceptor of responseInterceptors) {
        if (interceptor.onFulfilled) {
          response = await interceptor.onFulfilled(response);
        }
      }
      return response;
    } catch (error) {
      let currentError = error;
      for (const interceptor of responseInterceptors) {
        if (!interceptor.onRejected) continue;
        try {
          return await interceptor.onRejected(currentError);
        } catch (nextError) {
          currentError = nextError;
        }
      }
      throw currentError;
    }
  }) as MockClient;

  client.interceptors = {
    request: {
      use: jest.fn((onFulfilled: (config: any) => any) => {
        requestInterceptors.push(onFulfilled);
        return requestInterceptors.length - 1;
      })},
    response: {
      use: jest.fn((onFulfilled: (value: any) => any, onRejected: (error: any) => any) => {
        responseInterceptors.push({ onFulfilled, onRejected });
        return responseInterceptors.length - 1;
      })}};

  client.post = jest.fn((url: string, data?: unknown) => {
    return client({ method: 'POST', url, data, headers: {} });
  });

  return {
    client,
    setTransport(nextTransport: (config: any) => Promise<any>) {
      transport = nextTransport;
    }};
}

function unauthorized(config: any, url: string) {
  return {
    config: { ...config, url },
    response: {
      status: 401,
      data: { error: 'Token expired' }},
    message: 'Unauthorized'};
}

describe('apiService token refresh retry flow', () => {
  const storage = new Map<string, string>();
  let mockGetItem: jest.Mock;
  let mockSetItem: jest.Mock;
  let mockRemoveItem: jest.Mock;

  beforeEach(() => {
    storage.clear();

    mockGetItem = jest.fn((key: string) => storage.get(key) ?? null);
    mockSetItem = jest.fn((key: string, value: string) => {
      storage.set(key, value);
    });
    mockRemoveItem = jest.fn((key: string) => {
      storage.delete(key);
    });
    const storageMock = {
      getItem: mockGetItem,
      setItem: mockSetItem,
      removeItem: mockRemoveItem,
      clear: jest.fn(() => storage.clear())};
    Object.defineProperty(window, 'localStorage', {
      value: storageMock,
      configurable: true});
    Object.defineProperty(global, 'localStorage', {
      value: storageMock,
      configurable: true});

    document.cookie = '';
    window.history.replaceState({}, '', '/login');
    jest.resetModules();
  });

  it('retries original request after successful token refresh', async () => {
    const { client, setTransport } = createMockAxiosClient();
    const mockedAxios = jest.requireMock('axios');
    mockedAxios.default.create.mockReturnValue(client);
    mockedAxios.create.mockReturnValue(client);

    storage.set(STORAGE_KEYS.AUTH_TOKEN, 'old-token');

    setTransport(async (config) => {
      if (config.url === '/api/auth/refresh') {
        return { data: { token: 'new-token' } };
      }

      if (config.url === '/api/protected' && !config._retry) {
        throw unauthorized(config, '/api/protected');
      }

      if (config.url === '/api/protected' && config._retry) {
        return { data: { ok: true } };
      }

      return { data: {} };
    });

    const { apiService } = await import('./api');

    const result = await apiService.get<{ ok: boolean }>('/api/protected');

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ ok: true });
    expect(client.post).toHaveBeenCalledWith('/api/auth/refresh');
    expect(mockSetItem).toHaveBeenCalledWith(STORAGE_KEYS.AUTH_TOKEN, 'new-token');

    const protectedCalls = client.mock.calls.filter(([cfg]) => cfg.url === '/api/protected');
    expect(protectedCalls).toHaveLength(2);
    expect(protectedCalls[1][0]._retry).toBe(true);
    expect(protectedCalls[1][0].headers.Authorization).toBe('Bearer new-token');
  });

  it('clears auth when refresh fails after a 401', async () => {
    const { client, setTransport } = createMockAxiosClient();
    const mockedAxios = jest.requireMock('axios');
    mockedAxios.default.create.mockReturnValue(client);
    mockedAxios.create.mockReturnValue(client);

    storage.set(STORAGE_KEYS.AUTH_TOKEN, 'old-token');
    storage.set(STORAGE_KEYS.USER_DATA, '{"id":1}');

    setTransport(async (config) => {
      if (config.url === '/api/protected' && !config._retry) {
        throw unauthorized(config, '/api/protected');
      }

      if (config.url === '/api/auth/refresh') {
        throw unauthorized(config, '/api/auth/refresh');
      }

      return { data: {} };
    });

    const { apiService } = await import('./api');

    const result = await apiService.get('/api/protected');

    expect(result.success).toBe(false);
    expect(client.post).toHaveBeenCalledWith('/api/auth/refresh');
    expect(mockRemoveItem).toHaveBeenCalledWith(STORAGE_KEYS.AUTH_TOKEN);
    expect(mockRemoveItem).toHaveBeenCalledWith(STORAGE_KEYS.USER_DATA);
  });

  it('does not attempt refresh for login endpoint 401 responses', async () => {
    const { client, setTransport } = createMockAxiosClient();
    const mockedAxios = jest.requireMock('axios');
    mockedAxios.default.create.mockReturnValue(client);
    mockedAxios.create.mockReturnValue(client);

    setTransport(async (config) => {
      if (config.url === '/api/auth/login') {
        throw unauthorized(config, '/api/auth/login');
      }
      return { data: {} };
    });

    const { apiService } = await import('./api');

    const result = await apiService.post('/api/auth/login', {
      username: 'demo',
      password: 'demo'});

    expect(result.success).toBe(false);
    expect(client.post).not.toHaveBeenCalledWith('/api/auth/refresh');

    const loginCalls = client.mock.calls.filter(([cfg]) => cfg.url === '/api/auth/login');
    expect(loginCalls).toHaveLength(1);
  });
});
