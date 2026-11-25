import { test } from 'node:test';
import assert from 'node:assert/strict';
import { YOUTUBE_SHORTS_ASPECT, normalizeYouTubeUrl, youTubeLinkAspect, youTubePlayingUrl, youTubeThumbnail } from '../src/youtube.ts';
import { normalizePdfUrl } from '../src/pdf.ts';
import { isSupportedMediaSource, normalizeMediaSource } from '../src/media-source.ts';
import { MEDIA_SOURCE_FEATURES, mediaEditorLabel, mediaNoun, mediaSource, mediaSourceAspect, mediaSupports, youTubeStill } from '../src/media-sources.ts';
import { encodeMediaKey, posterKeyFor, resolveMedia, resolvePublishedMedia } from '../src/media.ts';
import { upgradeLegacyMediaBlock, upgradeStoryMediaGroups } from '../src/media-groups.ts';
import { MEDIA_APPEARANCE_LIMITS, mediaExpansionSettings, normalizeMediaAppearance, normalizeMediaExpansion } from '../src/media-appearance.ts';
import { DEFAULT_MEDIA_ASPECT, aspectDiffers, forgetMediaAspects, mediaAspect, rememberMediaAspect, withMeasuredAspects } from '../src/media-aspects.ts';
import { DEFAULT_IMAGE_ZOOM, IMAGE_ZOOM_LEVELS, isImageZoom, lightboxImageSize, stepImageZoom } from '../src/image-lightbox.ts';
import type { StoryBlock, StoryMedia } from '../src/types.ts';
import { image, story } from './fixtures.ts';

const ID = 'aBcDeFgHiJ0';

test('YouTube links of every common shape become one privacy-enhanced embed', () => {
  const embed = `https://www.youtube-nocookie.com/embed/${ID}`;
  for (const url of [
    `https://www.youtube.com/watch?v=${ID}&t=30s`,
    `https://youtube.com/watch?v=${ID}`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://music.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}?si=share`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/live/${ID}`,
    `https://www.youtube-nocookie.com/embed/${ID}`,
    `  https://youtu.be/${ID}  `,
  ]) assert.equal(normalizeYouTubeUrl(url), embed, url);
  for (const url of [undefined, '', 'not a url', `ftp://youtu.be/${ID}`, `https://youtube.evil.example/watch?v=${ID}`, 'https://youtu.be/short', `https://vimeo.com/${ID}`, `javascript:alert('${ID}')`]) {
    assert.equal(normalizeYouTubeUrl(url), null, String(url));
  }
});

test('YouTube stills, playback and Shorts shape come from the same link', () => {
  assert.equal(youTubeThumbnail(`https://youtu.be/${ID}`), `https://i.ytimg.com/vi/${ID}/mqdefault.jpg`);
  assert.equal(youTubeThumbnail(`https://youtu.be/${ID}`, 'maxresdefault'), `https://i.ytimg.com/vi/${ID}/maxresdefault.jpg`);
  assert.equal(youTubeThumbnail('nope'), null);
  assert.equal(youTubePlayingUrl(`https://www.youtube-nocookie.com/embed/${ID}`), `https://www.youtube-nocookie.com/embed/${ID}?autoplay=1`);
  assert.equal(youTubeLinkAspect(`https://www.youtube.com/shorts/${ID}`, 16 / 9), YOUTUBE_SHORTS_ASPECT);
  assert.equal(youTubeLinkAspect(`https://youtu.be/${ID}`, YOUTUBE_SHORTS_ASPECT), undefined, 'leaving Shorts drops its shape');
  assert.equal(youTubeLinkAspect(`https://youtu.be/${ID}`, 1.5), 1.5);
});

test('PDF links are same-origin paths or https files ending in .pdf', () => {
  for (const url of ['/media/brochure.pdf', '/media/a%20b.PDF', '/files/report.pdf?page=2', 'https://cdn.example.com/docs/report.pdf', 'https://cdn.example.com/r.pdf#page=3']) {
    assert.equal(normalizePdfUrl(url), url, url);
  }
  assert.equal(normalizePdfUrl('  /media/brochure.pdf '), '/media/brochure.pdf');
  for (const url of [undefined, '', '/media/brochure.doc', '//cdn.example.com/a.pdf', 'http://example.com/a.pdf', 'https://u:p@example.com/a.pdf',
    '/media/../secret.pdf', '/media/%2e%2e/secret.pdf', '/media/a b.pdf', '/media\\a.pdf', 'javascript:alert(1)//.pdf', 'data:application/pdf;base64,AA']) {
    assert.equal(normalizePdfUrl(url), null, String(url));
  }
  assert.equal(normalizePdfUrl('/media/a.pdf', { prefixes: ['/media/'] }), '/media/a.pdf');
  assert.equal(normalizePdfUrl('/other/a.pdf', { prefixes: ['/media/'] }), null);
});

test('media sources are paths or http(s) addresses', () => {
  for (const src of ['/media/a.png', 'https://cdn.example.com/a.png', 'http://localhost:3000/a.png']) assert.equal(isSupportedMediaSource(src), true, src);
  for (const src of [undefined, '', '//cdn.example.com/a.png', 'javascript:alert(1)', 'data:image/png;base64,AA', 'ftp://x/a.png', 'a.png']) {
    assert.equal(isSupportedMediaSource(src), false, String(src));
  }
  assert.equal(normalizeMediaSource('  /media/a.png '), '/media/a.png');
  assert.equal(normalizeMediaSource('javascript:x'), undefined);
});

test('what each media source supports, in words an editor can show', () => {
  const upload = { ...image('x'), src: undefined };
  const youtube: StoryMedia = { kind: 'video', sourceMode: 'youtube', youtubeUrl: `https://youtu.be/${ID}`, alt: '' };
  const pdf: StoryMedia = { kind: 'image', sourceMode: 'pdf', pdfUrl: '/media/a.pdf', alt: '' };
  assert.equal(mediaSource(upload), 'media');
  assert.equal(mediaSupports(upload, 'upload'), true);
  assert.equal(mediaSupports(youtube, 'upload'), false);
  assert.equal(mediaSupports(pdf, 'framing'), false);
  for (const reasons of [MEDIA_SOURCE_FEATURES.youtube, MEDIA_SOURCE_FEATURES.pdf]) {
    for (const reason of Object.values(reasons)) if (reason !== true) assert.doesNotMatch(reason, /\/api\/|the site/);
  }
  assert.deepEqual([mediaNoun(upload), mediaNoun(youtube), mediaNoun(pdf), mediaNoun({ ...image('v'), kind: 'video' })], ['image', 'video', 'document', 'video']);
  assert.deepEqual([mediaEditorLabel(upload), mediaEditorLabel(image('y')), mediaEditorLabel(youtube), mediaEditorLabel(pdf)], ['Media', 'Image', 'YouTube', 'PDF']);
  assert.equal(mediaSourceAspect(youtube), 16 / 9);
  assert.equal(mediaSourceAspect(pdf), 4 / 3);
  assert.equal(mediaSourceAspect({ ...upload, aspect: undefined }), DEFAULT_MEDIA_ASPECT);
  assert.equal(youTubeStill(youtube), `https://i.ytimg.com/vi/${ID}/mqdefault.jpg`);
  assert.equal(youTubeStill({ ...youtube, poster: '/media/still.jpg' }), '/media/still.jpg');
  assert.equal(youTubeStill(upload), null);
});

test('published media resolves an explicit source, or an uploaded key through the host route', () => {
  const mediaUrl = (key: string) => `/media/${encodeMediaKey(key)}`;
  assert.deepEqual(resolvePublishedMedia(image('a')), { src: '/media/fieldnote/a.svg', poster: undefined, draft: false, unoptimized: false });
  assert.equal(resolvePublishedMedia({ ...image('a'), src: 'https://cdn.example.com/a.png' }).unoptimized, true);
  assert.equal(resolvePublishedMedia(image('a'), { unoptimizedPrefixes: ['/media/'] }).unoptimized, true);

  const clip: StoryMedia = { kind: 'video', alt: 'A clip', shot: { brief: 'Scroll the index', draft: 'clips/index scroll.mp4' } };
  assert.deepEqual(resolvePublishedMedia(clip), { draft: false, unoptimized: false }, 'no route, nothing to serve');
  assert.deepEqual(resolvePublishedMedia(clip, { mediaUrl }), { draft: false, unoptimized: false }, 'not uploaded yet');
  assert.deepEqual(resolvePublishedMedia(clip, { mediaUrl, uploadedMediaKeys: ['clips/index scroll.mp4', 'clips/index scroll.jpg'] }), {
    src: '/media/clips/index%20scroll.mp4', poster: '/media/clips/index%20scroll.jpg', draft: false, unoptimized: true,
  });
  assert.equal(posterKeyFor('a/b.webm'), 'a/b.jpg');

  // Development previews a local draft cut, badged as a draft.
  const draftUrl = (key: string) => `/dev-media/${key}`;
  assert.deepEqual(resolveMedia(clip, { development: true, draftUrl }), { src: '/dev-media/clips/index scroll.mp4', poster: '/dev-media/clips/index scroll.jpg', draft: true, unoptimized: true });
  assert.deepEqual(resolveMedia(clip, { draftUrl }), { draft: false, unoptimized: false }, 'never outside development');
});

test('stored pairs and comparisons upgrade to image groups, keeping what readers saw', () => {
  assert.deepEqual(upgradeLegacyMediaBlock({ type: 'pair', items: [image('a'), image('b')] }), { type: 'gallery', layout: 'horizontal', items: [image('a'), image('b')] });
  const compared = upgradeLegacyMediaBlock({ type: 'compare', before: image('a'), after: { ...image('b'), heading: 'Today' }, afterLabel: 'Now' }) as { items: StoryMedia[]; type: string };
  assert.equal(compared.type, 'gallery');
  assert.deepEqual(compared.items.map((item) => item.heading), ['Before', 'Now · Today']);
  assert.equal(upgradeLegacyMediaBlock('text'), 'text');
  const unchanged = story();
  assert.equal(upgradeStoryMediaGroups(unchanged), unchanged, 'the same object when nothing changes');
  const legacy = story();
  legacy.chapters[0].blocks.push({ type: 'pair', items: [image('a')] } as unknown as StoryBlock);
  assert.equal(upgradeStoryMediaGroups(legacy).chapters[0].blocks.at(-1)?.type, 'gallery');
});

test('appearance and expansion settings clamp to their limits and drop unknown values', () => {
  assert.deepEqual(normalizeMediaAppearance({ radius: 99.6, matInsetX: -4, borderStyle: 'dashed', shadow: 'neon' as never }), { matInsetX: 0, radius: MEDIA_APPEARANCE_LIMITS.radius, borderStyle: 'dashed' });
  assert.equal(normalizeMediaAppearance({ shadow: 'neon' as never }), undefined);
  assert.equal(normalizeMediaAppearance([] as never), undefined);
  assert.deepEqual(normalizeMediaExpansion({ enabled: false, zoom: 33 as never, x: 120, y: 12.4 }), { enabled: false, x: 100, y: 12 });
  assert.deepEqual(mediaExpansionSettings(undefined), { enabled: true, zoom: DEFAULT_IMAGE_ZOOM, x: 50, y: 50 });
  assert.deepEqual(mediaExpansionSettings({ zoom: 200 }), { enabled: true, zoom: 200, x: 50, y: 50 });
});

test('lightbox zoom steps through fixed levels and fits the viewport', () => {
  assert.equal(isImageZoom(75), true);
  assert.equal(isImageZoom(80), false);
  assert.equal(stepImageZoom(75, 1), 100);
  assert.equal(stepImageZoom(IMAGE_ZOOM_LEVELS[0], -1), IMAGE_ZOOM_LEVELS[0]);
  assert.equal(stepImageZoom(400, 1), 400);
  assert.deepEqual(lightboxImageSize({ width: 2000, height: 1000 }, { width: 1000, height: 1000 }, 100), { width: 1000, height: 500 });
  assert.deepEqual(lightboxImageSize({ width: 2000, height: 1000 }, { width: 1000, height: 1000 }, 50), { width: 500, height: 250 });
  assert.equal(lightboxImageSize({ width: 0, height: 1 }, { width: 1, height: 1 }, 100), undefined);
});

test('measured aspects correct a story only where the file differs', () => {
  forgetMediaAspects();
  const base = story();
  assert.equal(withMeasuredAspects(base), base);
  assert.equal(mediaAspect(1920, 1080), 1.7778);
  assert.equal(aspectDiffers(1.6, 1.605), false);
  assert.equal(aspectDiffers(1.6, 1.78), true);
  rememberMediaAspect('/media/fieldnote/guide-index.svg', 1.2);
  rememberMediaAspect('/media/fieldnote/guide-entry.svg', 1.6001);
  const measured = withMeasuredAspects(base);
  assert.notEqual(measured, base);
  const gallery = measured.chapters[2].blocks.find((block) => block.type === 'gallery');
  assert.ok(gallery?.type === 'gallery');
  assert.deepEqual(gallery.items.map((item) => item.aspect), [1.2, 16 / 10]);
  assert.equal(measured.chapters[0], base.chapters[0], 'untouched branches keep their identity');
  forgetMediaAspects();
});
