import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import type { AuthAdapter } from '@rcweston/story-core';
import { createOpenAuth } from '@rcweston/story-server/memory';
import { createPasscodeAuth } from '@rcweston/story-server/passcode';
import {
  community,
  createSiteData,
  home,
  migrate,
  normalizeCommunity,
  normalizeReelUrl,
  parseHeaderImages,
  parseHomeAbout,
  resolveHeaderImages,
  showreel,
  linksFor,
  toPlainText,
  visibleCommunity,
  type CommunityContent,
  type HomeAbout,
} from '../src/index.ts';

const modules = [home, community, showreel] as const;

const about: HomeAbout = {
  tagline: 'I design the tools teams use to decide.',
  bio: ['Currently at [Fieldnote Studio](https://example.com).', 'I start by watching the work.'],
  fastFacts: ['Research, product and systems design'],
};

const library = [
  { src: '/api/story/media/stories/field-notes/cover.svg', alt: 'Note cards on a desk' },
  { src: '/api/story/media/stories/transit-map/cover.svg', alt: 'A route map' },
  { src: '/api/story/media/stories/button-audit/cover.svg', alt: 'Buttons in a row' },
  { src: '/api/story/media/stories/quiet-onboarding/cover.svg', alt: 'A phone on linen' },
];

const page: CommunityContent = normalizeCommunity({
  title: 'Community',
  summary: 'I mentor designers and talk about research tools.',
  contactLabel: 'Email me',
  contactHref: 'mailto:hello@example.com',
  mentoring: { heading: 'Mentoring', intro: 'Office hours for researchers.', bookingLabel: 'Book a chat', bookingHref: 'https://example.com/book', bookingNote: 'Thirty minutes.', pitch: 'I help the first designer on a team.', body: ['Bring a real situation.'], topicsHeading: 'Ask me about', topics: ['Research ops', 'Writing'], history: 'Mentoring since 2019.' },
  speaking: { heading: 'Speaking', intro: 'Talks on research.', talks: [{ date: '2025-05-01', title: 'Decisions with dates', venue: 'Harbor Design Week', description: '', kind: 'Talk', action: 'Watch', minutes: 32, href: 'https://example.com/talk' }] },
  events: { heading: 'Events', intro: 'Groups I show up for.', groups: [{ name: 'Lisbon Research Club', about: 'Monthly reading nights.', href: 'https://example.com/club', action: 'Events' }] },
});

const config = {
  home: { about, library: async () => library },
  community: { defaults: page },
  showreel: { defaultReel: '/samples/showreel.webm', defaultPoster: '/samples/showreel-poster.svg' },
};

const at = (handle: (request: Request) => Promise<Response>) => (path: string, init: RequestInit & { json?: unknown } = {}) =>
  handle(new Request(`http://site.local/api/site${path}`, {
    ...init,
    headers: { ...(init.json !== undefined ? { 'content-type': 'application/json' } : {}), ...(init.headers as Record<string, string> | undefined) },
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  }));

function harness(options: { sql?: PGlite; auth?: AuthAdapter; revalidated?: string[][] } = {}) {
  const site = createSiteData({ modules, sql: options.sql, config });
  const handlers = site.handlers({ auth: options.auth ?? createOpenAuth(), revalidate: (paths) => void options.revalidated?.push(paths) });
  return { site, request: at(handlers.handle), routes: handlers.routes };
}

describe('home, community and showreel models', () => {
  it('trims the letter and names what is missing', () => {
    assert.deepEqual(parseHomeAbout({ tagline: '  Hi ', bio: [' One ', '', 4], fastFacts: [] }), { about: { tagline: 'Hi', bio: ['One'], fastFacts: [] } });
    assert.deepEqual(parseHomeAbout({ tagline: '', bio: ['x'], fastFacts: [] }), { error: 'Tagline is required' });
    assert.deepEqual(parseHomeAbout({ tagline: 'x', bio: [], fastFacts: [] }), { error: 'At least one bio paragraph is required' });
    assert.equal(toPlainText('At [Fieldnote](https://example.com), **plainly**.'), 'At Fieldnote, plainly.');
  });

  it('takes three slots of site or https images and falls back slot by slot', () => {
    assert.equal(parseHeaderImages([null, null]), null);
    assert.equal(parseHeaderImages([{ source: 'upload', src: 'javascript:alert(1)', alt: '' }, null, null]), null);
    assert.equal(parseHeaderImages([{ source: 'upload', src: '//evil.example/x.png', alt: '' }, null, null]), null);
    const images = parseHeaderImages([{ source: 'upload', src: '/api/story/media/stories/home-header/a.png', alt: ' A desk ' }, { source: 'shots', src: library[3].src, alt: '' }, { source: 'shots', src: '/gone.png', alt: 'gone' }]);
    assert.ok(images);
    assert.equal(images[0]?.alt, 'A desk');
    assert.deepEqual(resolveHeaderImages(images, library).map((photo) => photo.src), ['/api/story/media/stories/home-header/a.png', library[3].src, library[2].src]);
    assert.deepEqual(resolveHeaderImages([null, null, null], library.slice(0, 2)).length, 2);
  });

  it('keeps the community page whole when a field is wrong, and drops rows without a link', () => {
    const fixed = normalizeCommunity({ title: '', summary: 7, speaking: { talks: [{ title: 'No link' }, { title: 'Linked', href: ' https://example.com ', minutes: 12.4 }] } }, page);
    assert.equal(fixed.title, 'Community');
    assert.equal(fixed.summary, page.summary);
    assert.deepEqual(fixed.speaking.talks.map((talk) => [talk.title, talk.href, talk.minutes]), [['Linked', 'https://example.com', 12]]);
    assert.deepEqual(fixed.events, page.events);
  });

  it('keeps a hidden talk or group in the document and leaves it off the page', () => {
    const talk = { title: 'Hidden', href: 'https://example.com/h', hidden: true };
    const fixed = normalizeCommunity({ ...page, speaking: { ...page.speaking, talks: [talk, { title: 'Shown', href: 'https://example.com/s', hidden: 'yes' }] } }, page);
    assert.deepEqual(fixed.speaking.talks.map((t) => [t.title, t.hidden]), [['Hidden', true], ['Shown', undefined]]);
    assert.deepEqual(visibleCommunity(fixed).speaking.talks.map((t) => t.title), ['Shown']);
  });

  it('plays an uploaded video or a Figma deck, and nothing else', () => {
    assert.deepEqual(normalizeReelUrl('/api/story/media/stories/showreel/0a1b.webm'), { url: '/api/story/media/stories/showreel/0a1b.webm' });
    assert.deepEqual(normalizeReelUrl('https://figma.com/deck/AbC123/Reel?node-id=1-2&embed-host=x'), { url: 'https://www.figma.com/deck/AbC123/Reel?node-id=1-2' });
    assert.ok('error' in normalizeReelUrl('http://www.figma.com/deck/AbC123'));
    assert.ok('error' in normalizeReelUrl('https://example.com/page'));
    assert.ok('error' in normalizeReelUrl('/api/story/media/stories/showreel/cover.png'));
    const deck = linksFor('https://www.figma.com/deck/AbC123/Reel?node-id=1-2');
    assert.equal(deck.kind, 'deck');
    assert.equal(deck.embed, 'https://embed.figma.com/deck/AbC123/Reel?node-id=1-2&embed-host=site-kit');
    assert.equal(linksFor('/a.mp4').video, '/a.mp4');
  });
});

for (const backend of ['memory', 'postgres'] as const) {
  describe(`home, community and showreel on ${backend}`, () => {
    async function setup(options: Parameters<typeof harness>[0] = {}) {
      if (backend === 'memory') return { ...harness(options), close: async () => undefined };
      const sql = new PGlite();
      await migrate({ client: sql, modules });
      return { ...harness({ ...options, sql }), close: () => sql.close() };
    }

    it('shows the shipped copy until a save, refuses a stale save, and resets', async () => {
      const revalidated: string[][] = [];
      const { site, request, close } = await setup({ revalidated });
      try {
        const first = await (await request('/home/about')).json();
        assert.deepEqual([first.customized, first.version], [false, 0]);
        assert.deepEqual(first.about, about);
        assert.deepEqual(await site.reads.home.about(), about);

        const edited = { ...about, tagline: 'Plain words are a feature.', bio: [...about.bio, ' A third paragraph. ', ''] };
        const saved = await request('/home/about', { method: 'PUT', json: { ...edited, expectedVersion: 0 } });
        assert.equal(saved.status, 200);
        const body = await saved.json();
        assert.deepEqual([body.customized, body.version, body.about.bio.length, body.about.bio[2]], [true, 1, 3, 'A third paragraph.']);
        assert.equal((await site.reads.home.about()).tagline, 'Plain words are a feature.');
        assert.deepEqual(revalidated.at(-1), ['/']);

        const stale = await request('/home/about', { method: 'PUT', json: { ...about, expectedVersion: 0 } });
        assert.equal(stale.status, 409);
        assert.equal((await stale.json()).current.value.tagline, 'Plain words are a feature.');
        assert.equal((await request('/home/about', { method: 'PUT', json: { ...about, tagline: ' ' } })).status, 400);

        const reset = await (await request('/home/about', { method: 'DELETE' })).json();
        assert.deepEqual([reset.customized, reset.version, reset.about.tagline], [false, 0, about.tagline]);
        assert.deepEqual(await site.reads.home.about(), about);
      } finally {
        await close();
      }
    });

    it('saves header images against the library and resolves them for the page', async () => {
      const { site, request, close } = await setup();
      try {
        const first = await (await request('/home/header-images')).json();
        assert.deepEqual(first.images, [null, null, null]);
        assert.equal(first.shots.length, 4);
        assert.deepEqual((await site.reads.home.headerPhotos()).map((photo) => photo.src), library.slice(0, 3).map((photo) => photo.src));

        const images = [{ source: 'shots', src: library[3].src, alt: 'A phone on linen, close' }, null, { source: 'upload', src: '/api/story/media/stories/home-header/abc.png', alt: 'A desk' }];
        const saved = await request('/home/header-images', { method: 'PUT', json: { images, expectedVersion: 0 } });
        assert.equal(saved.status, 200);
        assert.equal((await saved.json()).version, 1);
        assert.deepEqual((await site.reads.home.headerPhotos()).map((photo) => [photo.src, photo.alt]), [
          [library[3].src, 'A phone on linen, close'],
          [library[1].src, library[1].alt],
          ['/api/story/media/stories/home-header/abc.png', 'A desk'],
        ]);
        assert.equal((await request('/home/header-images', { method: 'PUT', json: { images, expectedVersion: 0 } })).status, 409);
        const gone = await request('/home/header-images', { method: 'PUT', json: { images: [{ source: 'shots', src: '/not/in/library.png', alt: '' }, null, null] } });
        assert.equal(gone.status, 400);
        assert.match((await gone.json()).error, /no longer in the gallery/);
        assert.equal((await request('/home/header-images', { method: 'PUT', json: { images: [null] } })).status, 400);
      } finally {
        await close();
      }
    });

    it('edits, conflicts and resets the community page', async () => {
      const revalidated: string[][] = [];
      const { site, request, close } = await setup({ revalidated });
      try {
        const first = await (await request('/community')).json();
        assert.deepEqual([first.customized, first.version, first.path], [false, 0, '/community']);
        assert.deepEqual(first.content, page);

        const talks = [{ ...page.speaking.talks[0], title: 'Decisions, dated' }, { date: '2024-03-02', title: 'Reading the room', venue: 'Northfold Talks', description: '', kind: 'Panel', action: 'Watch', minutes: null, href: 'https://example.com/panel' }, { title: 'Draft row', href: '' }];
        const content = { ...page, speaking: { ...page.speaking, talks } };
        const saved = await (await request('/community', { method: 'PUT', json: { content, expectedVersion: 0 } })).json();
        assert.deepEqual(saved.content.speaking.talks.map((talk: { title: string }) => talk.title), ['Decisions, dated', 'Reading the room']);
        assert.deepEqual(revalidated.at(-1), ['/community']);
        assert.equal((await site.reads.community.content()).speaking.talks.length, 2);

        const hiding = { ...content, speaking: { ...content.speaking, talks: [{ ...talks[0], hidden: true }, talks[1]] } };
        const hidden = await (await request('/community', { method: 'PUT', json: { content: hiding, expectedVersion: 1 } })).json();
        assert.equal(hidden.content.speaking.talks[0].hidden, true, 'the admin still sees the hidden talk');
        assert.deepEqual((await site.reads.community.content()).speaking.talks.map((talk) => talk.title), ['Reading the room']);

        assert.equal((await request('/community', { method: 'PUT', json: { content, expectedVersion: 0 } })).status, 409);
        const unsafe = await request('/community', { method: 'PUT', json: { content: { ...page, contactHref: 'javascript:alert(1)' } } });
        assert.equal(unsafe.status, 400);
        assert.match((await unsafe.json()).error, /Header button link/);

        const reset = await (await request('/community', { method: 'DELETE' })).json();
        assert.deepEqual([reset.customized, reset.version], [false, 0]);
        assert.deepEqual(await site.reads.community.content(), page);
      } finally {
        await close();
      }
    });

    it('plays the default reel, a saved one, refuses one it cannot play, and resets', async () => {
      const { site, request, close } = await setup();
      try {
        const first = await (await request('/showreel')).json();
        assert.equal(first.setting, null);
        assert.deepEqual([first.links.kind, first.links.video, first.links.poster], ['video', '/samples/showreel.webm', '/samples/showreel-poster.svg']);

        const bad = await request('/showreel', { method: 'PUT', json: { url: 'https://example.com/page' } });
        assert.equal(bad.status, 422);
        const saved = await (await request('/showreel', { method: 'PUT', json: { url: '/api/story/media/stories/showreel/0a1b.mp4', expectedVersion: 0 } })).json();
        assert.deepEqual([saved.setting.url, saved.version, saved.links.poster], ['/api/story/media/stories/showreel/0a1b.mp4', 1, null]);
        assert.equal((await site.reads.showreel.links())?.video, '/api/story/media/stories/showreel/0a1b.mp4');
        assert.equal((await request('/showreel', { method: 'PUT', json: { url: 'https://www.figma.com/deck/Ab12/Reel', expectedVersion: 0 } })).status, 409);
        const deck = await (await request('/showreel', { method: 'PUT', json: { url: 'https://www.figma.com/deck/Ab12/Reel', expectedVersion: 1 } })).json();
        assert.equal(deck.links.kind, 'deck');

        const reset = await (await request('/showreel', { method: 'DELETE' })).json();
        assert.deepEqual([reset.setting, reset.version, reset.links.video], [null, 0, '/samples/showreel.webm']);
      } finally {
        await close();
      }
    });
  });
}

describe('home, community and showreel handlers', () => {
  it('ask for a session and list their routes', async () => {
    const auth = createPasscodeAuth({ passcode: 'open sesame', secret: 'a-test-secret-that-is-long-enough-to-sign' });
    const { request, routes } = harness({ auth });
    for (const path of ['/home/about', '/home/header-images', '/community', '/showreel']) assert.equal((await request(path)).status, 401, path);
    assert.equal((await request('/community', { method: 'PUT', json: { content: page }, headers: { origin: 'https://elsewhere.example' } })).status, 403);
    const listed = routes.map((route) => `${route.method} ${route.path}`);
    for (const route of ['PUT /api/site/home/about', 'DELETE /api/site/home/about', 'PUT /api/site/home/header-images', 'PUT /api/site/community', 'DELETE /api/site/showreel']) assert.ok(listed.includes(route), route);
  });

  it('read a fresh database as the whole shipped site', async () => {
    const site = createSiteData({ modules, config: { showreel: {} } });
    assert.deepEqual(await site.reads.home.about(), { tagline: '', bio: [], fastFacts: [] });
    assert.deepEqual(await site.reads.home.headerPhotos(), []);
    assert.equal((await site.reads.community.content()).title, 'Community');
    assert.equal(await site.reads.showreel.links(), null);
  });
});
