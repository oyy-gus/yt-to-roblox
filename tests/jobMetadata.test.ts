import { test, describe } from 'node:test';
import assert from 'node:assert';
import { JobQueue } from '../src/server/queue/inMemoryQueue.js';
import { isPrivateYouTubeVideo } from '../src/server/providers/youtubeProvider.js';

describe('JobQueue Custom Metadata Support', () => {
  const dummyMetadata = {
    isDemo: true,
    type: 'playlist' as const,
    title: 'Top Hits Playlist',
    totalEntries: 2,
    entries: [
      {
        id: 'track-1',
        title: 'LAGU TERBARU!! Singer One - First Song (Official Music Video)',
        artist: 'Singer One',
        durationSec: 180,
        thumbnail: 'https://example.com/thumb1.jpg',
        url: 'https://www.youtube.com/watch?v=track-1'
      },
      {
        id: 'track-2',
        title: 'Singer Two - Second Song (Live Acoustic)',
        artist: 'Singer Two',
        durationSec: 210,
        thumbnail: 'https://example.com/thumb2.jpg',
        url: 'https://www.youtube.com/watch?v=track-2'
      }
    ]
  };

  test('Creates job with optional custom metadata overrides for tracks', () => {
    const queue = new JobQueue(1);

    const job = queue.createJob({
      id: 'job-custom-test',
      type: 'playlist',
      url: 'https://www.youtube.com/playlist?list=PL123',
      metadata: dummyMetadata,
      settings: {
        cleanerMode: 'Advanced',
        format: 'mp3',
        quality: '320',
        pitch: 2
      },
      selectedTrackIds: ['track-1', 'track-2'],
      customMetadata: {
        'track-1': {
          title: 'Custom Title One',
          artist: 'Custom Artist One',
          composer: 'Custom Composer One',
          album: 'Custom Album 2026',
          year: '2026',
          genre: 'Pop',
          trackNumber: '1',
          pitch: -1
        }
      }
    });

    assert.strictEqual(job.tracks.length, 2);
    assert.strictEqual(job.pitch, 2);

    const t1 = job.tracks[0];
    assert.strictEqual(t1.cleanedTitle, 'Custom Title One');
    assert.strictEqual(t1.artist, 'byps#@$%');
    assert.strictEqual(t1.composer, 'byps#@$%');
    assert.strictEqual(t1.album, 'byps#@$%');
    assert.strictEqual(t1.year, String(new Date().getFullYear()));
    assert.strictEqual(t1.genre, null);
    assert.strictEqual(t1.trackNumber, '1');
    assert.strictEqual(t1.pitch, -1);
    assert.strictEqual(t1.robloxInfo?.type, 'PitchShift');
    assert.strictEqual(t1.robloxInfo?.value, '1.059');
    assert.strictEqual(t1.isCustomMetadata, true);
    assert.ok(t1.filename.includes('Custom Title One.mp3'));

    const t2 = job.tracks[1];
    assert.strictEqual(t2.artist, 'byps#@$%');
    assert.strictEqual(t2.composer, 'byps#@$%');
    assert.strictEqual(t2.album, 'byps#@$%');
    assert.strictEqual(t2.year, String(new Date().getFullYear()));
    assert.strictEqual(t2.genre, null);
    assert.ok(t2.cleanedTitle.includes('Second Song'));
    assert.strictEqual(t2.pitch, 2);
    assert.strictEqual(t2.robloxInfo?.type, 'PitchShift');
    assert.strictEqual(t2.robloxInfo?.value, '0.891');
    assert.strictEqual(t2.isCustomMetadata, false);

    queue.cancelJob(job.id);
  });

  test('Filters out tracks exceeding 7 minutes (420s) when targetAction is roblox', () => {
    const queue = new JobQueue(1);
    const mixedMetadata = {
      isDemo: true,
      type: 'playlist' as const,
      title: 'Duration Test',
      totalEntries: 2,
      entries: [
        {
          id: 'short-track',
          title: 'Singer - Short Track',
          artist: 'Singer',
          durationSec: 300,
          thumbnail: 'https://example.com/short.jpg',
          url: 'https://www.youtube.com/watch?v=short'
        },
        {
          id: 'long-track',
          title: 'Singer - Long Track Mix',
          artist: 'Singer',
          durationSec: 500,
          thumbnail: 'https://example.com/long.jpg',
          url: 'https://www.youtube.com/watch?v=long'
        }
      ]
    };

    const robloxJob = queue.createJob({
      id: 'job-roblox-filter-test',
      type: 'playlist',
      url: 'https://www.youtube.com/playlist?list=PL123',
      metadata: mixedMetadata,
      settings: {
        cleanerMode: 'Advanced',
        format: 'mp3',
        quality: '320',
        pitch: 0
      },
      targetAction: 'roblox',
      robloxConfig: { apiKey: 'test', creatorId: '123' },
      selectedTrackIds: ['short-track', 'long-track']
    });

    assert.strictEqual(robloxJob.tracks.length, 1);
    assert.strictEqual(robloxJob.tracks[0].id, 'short-track');
    queue.cancelJob(robloxJob.id);
  });

  test('Filters out private tracks when targetAction is roblox', () => {
    const queue = new JobQueue(1);
    const mixedMetadata = {
      isDemo: true,
      type: 'playlist' as const,
      title: 'Private Filter Test',
      totalEntries: 2,
      entries: [
        {
          id: 'public-track',
          title: 'Singer - Public Track',
          artist: 'Singer',
          durationSec: 180,
          thumbnail: 'https://example.com/public.jpg',
          url: 'https://www.youtube.com/watch?v=public',
          isPrivate: false
        },
        {
          id: 'private-track',
          title: '[Private video]',
          artist: null,
          durationSec: 0,
          thumbnail: null,
          url: 'https://www.youtube.com/watch?v=private',
          isPrivate: true
        }
      ]
    };

    const robloxJob = queue.createJob({
      id: 'job-roblox-private-filter-test',
      type: 'playlist',
      url: 'https://www.youtube.com/playlist?list=PL123',
      metadata: mixedMetadata,
      settings: {
        cleanerMode: 'Advanced',
        format: 'mp3',
        quality: '128',
        pitch: 0
      },
      targetAction: 'roblox',
      robloxConfig: { apiKey: 'test', creatorId: '123' },
      selectedTrackIds: ['public-track', 'private-track']
    });

    assert.strictEqual(robloxJob.tracks.length, 1);
    assert.strictEqual(robloxJob.tracks[0].id, 'public-track');
    queue.cancelJob(robloxJob.id);
  });

  test('isPrivateYouTubeVideo detects private videos from yt-dlp and YouTube API fields', () => {
    assert.strictEqual(isPrivateYouTubeVideo({ title: '[Private video]' }), true);
    assert.strictEqual(isPrivateYouTubeVideo({ title: 'Private video' }), true);
    assert.strictEqual(isPrivateYouTubeVideo({ title: 'My Song', availability: 'private' }), true);
    assert.strictEqual(isPrivateYouTubeVideo({ title: 'My Song', privacyStatus: 'private' }), true);
    assert.strictEqual(isPrivateYouTubeVideo({ title: 'My Song', availability: 'public' }), false);
    assert.strictEqual(isPrivateYouTubeVideo({ title: 'My Song', availability: 'unlisted' }), false);
  });
});
