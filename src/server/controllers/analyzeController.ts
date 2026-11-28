import type { Request, Response, NextFunction } from 'express';
import { validateUrl } from '../validators/urlValidator.js';
import { YouTubeProviderAdapter } from '../providers/youtubeProvider.js';

const youtubeProvider = new YouTubeProviderAdapter();

function toSafeFilename(title: string, index: number | null): string {
  const safeTitle = (title || 'Untitled').replace(/[/\\?%*:|"<>]/g, '').trim() || 'Untitled';
  const prefix = index !== null ? `${String(index).padStart(3, '0')} - ` : '';
  return `${prefix}${safeTitle}.mp3`;
}

export async function analyzeUrlHandler(req: Request, res: Response, next: NextFunction): Promise<any> {
  try {
    const { url } = req.body;

    const urlValidation = validateUrl(url);
    if (!urlValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: urlValidation.reason
      });
    }

    const metadata = await youtubeProvider.analyzeUrl(urlValidation);

    const seenIds = new Set<string>();
    const rawEntries = metadata.entries || [];
    const uniqueEntries = rawEntries.filter((entry) => {
      if (!entry.id || seenIds.has(entry.id)) return false;
      if (entry.isPrivate) return false;
      if (entry.durationSec && entry.durationSec > 420) return false;
      seenIds.add(entry.id);
      return true;
    });

    if (rawEntries.length > 0 && uniqueEntries.length === 0) {
      const allPrivate = rawEntries.every((entry) => entry.isPrivate);
      const hasPrivate = rawEntries.some((entry) => entry.isPrivate);
      const errorMsg = allPrivate
        ? 'Tidak ada lagu yang ditampilkan karena video bersifat private.'
        : hasPrivate
          ? 'Tidak ada lagu yang ditampilkan karena semua lagu bersifat private atau berdurasi lebih dari 7 menit (batas maksimum Roblox).'
          : 'Tidak ada lagu yang ditampilkan karena semua lagu berdurasi lebih dari 7 menit (batas maksimum Roblox).';

      return res.status(400).json({
        success: false,
        error: errorMsg
      });
    }

    const tracksWithPreviews = uniqueEntries.map((entry, index) => {
      const rawTitle = (entry.title || 'Untitled').trim();
      return {
        id: entry.id,
        originalTitle: entry.title,
        cleanedTitle: rawTitle,
        proposedFilename: toSafeFilename(rawTitle, uniqueEntries.length > 1 ? index + 1 : null),
        detectedArtist: 'byps#@$%',
        detectedComposer: 'byps#@$%',
        composer: 'byps#@$%',
        detectedVersion: null,
        cleaningMode: 'Default',
        durationSec: entry.durationSec,
        thumbnail: entry.thumbnail,
        channel: entry.channel,
        url: entry.url
      };
    });

    return res.json({
      success: true,
      data: {
        isDemo: metadata.isDemo,
        type: metadata.type,
        title: metadata.title,
        channel: metadata.channel,
        thumbnail: metadata.thumbnail,
        totalEntries: uniqueEntries.length,
        cleanerMode: 'Default',
        tracks: tracksWithPreviews
      }
    });

  } catch (err) {
    next(err);
  }
}
