import {
  MediaSource,
  MediaSourceFactory,
  MediaSourceKind,
  MediaSourceInfo,
  MediaFetchRequest,
  MediaMatch,
  Media,
  MediaDownload,
  PagedResult,
  ConnectionStatus,
  SourceConfig,
  SourceParameter,
  MatchKind,
} from '../types';
import { openDB } from 'idb';

const DB_NAME = 'anispace-media-cache';
const DB_VERSION = 1;
const STORE_NAME = 'media_cache';

export interface CachedMedia {
  id: string;           // subjectId_episodeSort as key
  subjectId: string;
  episodeSort: string;
  title: string;
  blob: Blob;
  contentType: string;  // e.g. 'video/mp4'
  size: number;
  savedAt: number;      // timestamp
}

let _dbPromise: Promise<any> | null = null;

function getDB() {
  if (!_dbPromise) {
    _dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('subjectId', 'subjectId');
          store.createIndex('episodeSort', 'episodeSort');
        }
      },
    });
  }
  return _dbPromise;
}

class LocalCacheSource implements MediaSource {
  readonly sourceId = 'local_cache';
  readonly kind = MediaSourceKind.LOCAL_CACHE;
  readonly info: MediaSourceInfo = {
    displayName: '本地缓存',
    description: '已下载到浏览器的缓存资源',
    isSpecial: true,
    tier: 1,  // Highest priority - local cache is fastest
  };

  async checkConnection(): Promise<ConnectionStatus> {
    try {
      await getDB();
      return ConnectionStatus.AVAILABLE;
    } catch {
      return ConnectionStatus.UNAVAILABLE;
    }
  }

  async fetch(request: MediaFetchRequest): Promise<PagedResult<MediaMatch>> {
    try {
      const db = await getDB();
      const all = await db.getAll(STORE_NAME) as CachedMedia[];

      // Filter by subjectId
      const matches = all.filter(
        c => c.subjectId === request.subjectId
      );

      if (matches.length === 0) {
        return { items: [], total: 0, page: 1, pagecount: 0, hasMore: false };
      }

      // If episodeSort specified, filter further
      let filtered = matches;
      if (request.episodeSort) {
        filtered = matches.filter(c => c.episodeSort === request.episodeSort);
      }

      const mediaMatches: MediaMatch[] = filtered.map(cached => {
        const blobUrl = URL.createObjectURL(cached.blob);
        const media: Media = {
          mediaId: `local_${cached.id}`,
          sourceId: 'local_cache',
          title: cached.title,
          episodeRange: { sort: cached.episodeSort },
          download: {
            kind: 'local',
            url: blobUrl,
          },
          properties: {
            fileSize: `${(cached.size / 1024 / 1024).toFixed(1)} MB`,
            contentType: cached.contentType,
            savedAt: new Date(cached.savedAt).toLocaleString(),
            tier: this.info.tier,
          },
        };
        return { media, matchKind: MatchKind.EXACT };
      });

      return {
        items: mediaMatches,
        total: mediaMatches.length,
        page: 1,
        pagecount: 1,
        hasMore: false,
      };
    } catch {
      return { items: [], total: 0, page: 1, pagecount: 0, hasMore: false };
    }
  }

  close(): void {
    // No cleanup needed for IndexedDB
  }
}

class LocalCacheSourceFactory implements MediaSourceFactory {
  readonly factoryId = 'local_cache';
  readonly allowMultipleInstances = false;
  readonly parameters: SourceParameter[] = [];
  readonly info: MediaSourceInfo = {
    displayName: '本地缓存',
    description: '已下载到浏览器的缓存资源（自动管理）',
    isSpecial: true,
  };

  create(sourceId: string, config: SourceConfig): MediaSource {
    return new LocalCacheSource();
  }
}

// Helper: Save a media blob to cache
export async function saveMediaToCache(
  subjectId: string,
  episodeSort: string,
  title: string,
  blob: Blob,
  contentType: string = 'video/mp4',
): Promise<void> {
  const db = await getDB();
  const id = `${subjectId}_${episodeSort}`;
  const entry: CachedMedia = {
    id,
    subjectId,
    episodeSort,
    title,
    blob,
    contentType,
    size: blob.size,
    savedAt: Date.now(),
  };
  await db.put(STORE_NAME, entry);
}

// Helper: Get a cached media entry
export async function getCachedMedia(
  subjectId: string,
  episodeSort: string,
): Promise<CachedMedia | null> {
  const db = await getDB();
  const id = `${subjectId}_${episodeSort}`;
  return (await db.get(STORE_NAME, id)) || null;
}

// Helper: Delete a cached media entry
export async function deleteCachedMedia(
  subjectId: string,
  episodeSort: string,
): Promise<void> {
  const db = await getDB();
  const id = `${subjectId}_${episodeSort}`;
  await db.delete(STORE_NAME, id);
}

// Helper: List all cached media
export async function listCachedMedia(): Promise<CachedMedia[]> {
  const db = await getDB();
  return (await db.getAll(STORE_NAME)) as CachedMedia[];
}

export { LocalCacheSource, LocalCacheSourceFactory };
