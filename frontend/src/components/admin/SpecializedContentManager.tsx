import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Film } from 'lucide-react';
import { useKidsContent } from '@/hooks/useSpecializedContent';
import { useTranslation } from 'react-i18next';
import useLoadNamespace from '@/hooks/useLoadNamespace';

const SPECIALIZED_NS = 'admin/specializedContent';

export function SpecializedContentManager() {
  const nsLoading = useLoadNamespace(SPECIALIZED_NS);
  const { t } = useTranslation([SPECIALIZED_NS, 'translation']);
  const [activeTab, setActiveTab] = useState('kids');

  if (nsLoading) {
    return <div className="container mx-auto p-6">{t('common.loading', { ns: 'translation' })}</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Film className="h-5 w-5" />
            {t('title')}
          </CardTitle>
        </CardHeader>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="kids">{t('tabs.kids')}</TabsTrigger>
          <TabsTrigger value="anime">{t('tabs.anime')}</TabsTrigger>
          <TabsTrigger value="events">{t('tabs.events')}</TabsTrigger>
          <TabsTrigger value="tv">{t('tabs.tv')}</TabsTrigger>
          <TabsTrigger value="movies">{t('tabs.movies')}</TabsTrigger>
          <TabsTrigger value="series">{t('tabs.series')}</TabsTrigger>
        </TabsList>

        <TabsContent value="kids">
          <KidsContentTab />
        </TabsContent>

        <TabsContent value="anime">
          <AnimeContentTab />
        </TabsContent>

        <TabsContent value="events">
          <EventsTab />
        </TabsContent>

        <TabsContent value="tv">
          <TVChannelsTab />
        </TabsContent>

        <TabsContent value="movies">
          <MoviesTab />
        </TabsContent>

        <TabsContent value="series">
          <SeriesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KidsContentTab() {
  const { t } = useTranslation([SPECIALIZED_NS, 'translation']);
  const { content, loading, error, createContent } = useKidsContent();
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    stream_url: '',
    image_url: '',
    tmdb_id: '',
    year: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await createContent({
      ...formData,
      tmdb_id: formData.tmdb_id ? parseInt(formData.tmdb_id) : undefined,
      year: formData.year ? parseInt(formData.year) : undefined
    });
    if (result) {
      setFormData({ title: '', description: '', stream_url: '', image_url: '', tmdb_id: '', year: '' });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('kids.addContent')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="title">{t('form.title')}</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="description">{t('form.description')}</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="stream_url">{t('form.streamUrl')}</Label>
              <Input
                id="stream_url"
                value={formData.stream_url}
                onChange={(e) => setFormData({ ...formData, stream_url: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="image_url">{t('form.imageUrl')}</Label>
              <Input
                id="image_url"
                value={formData.image_url}
                onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="tmdb_id">{t('form.tmdbId')}</Label>
                <Input
                  id="tmdb_id"
                  type="number"
                  value={formData.tmdb_id}
                  onChange={(e) => setFormData({ ...formData, tmdb_id: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="year">{t('form.year')}</Label>
                <Input
                  id="year"
                  type="number"
                  value={formData.year}
                  onChange={(e) => setFormData({ ...formData, year: e.target.value })}
                />
              </div>
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? t('form.creating') : t('form.createContent')}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('kids.existingContent', { count: content.length })}</CardTitle>
        </CardHeader>
        <CardContent>
          {error && <p className="text-red-500 mb-4">{error}</p>}
          <div className="grid gap-4">
            {content.map((item) => (
              <div key={item.id} className="border p-4 rounded">
                <h3 className="font-semibold">{item.title}</h3>
                <p className="text-sm text-gray-600">{item.description}</p>
                <p className="text-sm text-gray-600">{t('kids.year', { year: item.year })}</p>
                <p className="text-sm text-gray-600">{t('kids.active', { status: item.active ? t('status.yes') : t('status.no') })}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Placeholder components for other tabs
function AnimeContentTab() {
  const { t } = useTranslation([SPECIALIZED_NS, 'translation']);
  return <div>{t('anime.placeholder')}</div>;
}

function EventsTab() {
  const { t } = useTranslation([SPECIALIZED_NS, 'translation']);
  return <div>{t('events.placeholder')}</div>;
}

function TVChannelsTab() {
  const { t } = useTranslation([SPECIALIZED_NS, 'translation']);
  return <div>{t('tvChannels.placeholder')}</div>;
}

function MoviesTab() {
  const { t } = useTranslation([SPECIALIZED_NS, 'translation']);
  return <div>{t('movies.placeholder')}</div>;
}

function SeriesTab() {
  const { t } = useTranslation([SPECIALIZED_NS, 'translation']);
  return <div>{t('seriesTab.placeholder')}</div>;
}
