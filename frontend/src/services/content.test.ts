jest.mock('./api', () => ({
  __esModule: true,
  apiService: {
    get: jest.fn()}}));

import { contentService } from './content';
import { apiService } from './api';

describe('contentService.searchContent contract alignment', () => {
  const mockedApi = apiService as jest.Mocked<typeof apiService>;
  const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;

  beforeEach(() => {
    mockedApi.get.mockReset();
    process.env.NEXT_PUBLIC_API_URL = 'https://backend.example.com';
  });

  afterAll(() => {
    process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
  });

  it('maps UI category aliases to backend category types and serializes supported query params', async () => {
    mockedApi.get.mockResolvedValue({
      success: true,
      data: {
        content: [],
        total: 0,
        page: 1,
        limit: 50,
        has_more: false}} as any);

    const result = await contentService.searchContent({
      q: 'sports',
      category: 'live',
      year: 2024,
      tmdb_id: 42,
      page: 2,
      limit: 50});

    expect(result.success).toBe(true);
    expect(mockedApi.get).toHaveBeenCalledTimes(1);

    const calledUrl = mockedApi.get.mock.calls[0][0] as string;
    const url = new URL(calledUrl, 'http://localhost');

    expect(url.pathname).toBe('/api/delivery/content/search');
    expect(url.searchParams.get('q')).toBe('sports');
    expect(url.searchParams.get('category')).toBe('TV');
    expect(url.searchParams.get('year')).toBe('2024');
    expect(url.searchParams.get('tmdb_id')).toBe('42');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('limit')).toBe('50');
  });

  it('normalizes relative metadata paths in search results', async () => {
    mockedApi.get.mockResolvedValue({
      success: true,
      data: {
        content: [
          {
            id: 10,
            category: { id: 2, name: 'TV', category_type: 'TV', created_at: '2026-01-01T00:00:00Z' },
            title: 'Channel One',
            image_url: '/metadata/posters/c1.jpg',
            backdrop_url: 'metadata/backdrops/c1.jpg',
            stream_url: 'https://cdn.example.com/live/c1.m3u8',
            created_at: '2026-01-01T00:00:00Z'},
        ],
        total: 1,
        page: 1,
        limit: 20,
        has_more: false}} as any);

    const result = await contentService.searchContent({ q: 'channel' });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.content[0].image_url).toBe('https://backend.example.com/metadata/posters/c1.jpg');
    expect(result.data.content[0].backdrop_url).toBe('https://backend.example.com/metadata/backdrops/c1.jpg');
  });
});

