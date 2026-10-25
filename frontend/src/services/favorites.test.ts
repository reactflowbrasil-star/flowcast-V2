jest.mock('./api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn()}}));

import favoritesService from './favorites';
import apiService from './api';

describe('favoritesService contract alignment', () => {
  const mockedApi = apiService as jest.Mocked<typeof apiService>;

  beforeEach(() => {
    mockedApi.get.mockReset();
    mockedApi.post.mockReset();
    mockedApi.delete.mockReset();
  });

  it('unwraps backend { success, data, error } envelope for getFavorites', async () => {
    mockedApi.get.mockResolvedValue({
      success: true,
      data: {
        success: true,
        data: {
          movies: ['1'],
          series: ['2'],
          channels: ['3'],
          music_tracks: [],
          music_albums: [],
          music_artists: []},
        error: null}} as any);

    const favorites = await favoritesService.getFavorites();

    expect(favorites.movies).toEqual(['1']);
    expect(favorites.series).toEqual(['2']);
    expect(favorites.channels).toEqual(['3']);
  });

  it('returns false fallback when remove endpoint succeeds but carries null data', async () => {
    mockedApi.delete.mockResolvedValue({
      success: true,
      data: {
        success: true,
        data: null,
        error: null}} as any);

    const removed = await favoritesService.removeFavorite('movie', '100');
    expect(removed).toBe(false);
  });

  it('throws when backend envelope marks operation as failed', async () => {
    mockedApi.get.mockResolvedValue({
      success: true,
      data: {
        success: false,
        data: null,
        error: 'Failed to get favorites'}} as any);

    await expect(favoritesService.getFavorites()).rejects.toThrow('Failed to get favorites');
  });
});

