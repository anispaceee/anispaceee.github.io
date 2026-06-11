// src/services/media/initSources.ts
import { mediaSourceManager } from './MediaSourceManager';
import { MacCMSSourceFactory, DEFAULT_MACCMS_SOURCES } from './sources/MacCMSSource';
import { DmhySourceFactory } from './sources/DmhySource';
import { MikanSourceFactory } from './sources/MikanSource';
import { LocalCacheSourceFactory } from './sources/LocalCacheSource';

let initialized = false;

export function initMediaSources(): void {
  if (initialized) return;
  initialized = true;

  // Register factories
  mediaSourceManager.registerFactory(new MacCMSSourceFactory());
  mediaSourceManager.registerFactory(new DmhySourceFactory());
  mediaSourceManager.registerFactory(new MikanSourceFactory());
  mediaSourceManager.registerFactory(new LocalCacheSourceFactory());

  const existing = mediaSourceManager.getRegistrations();
  const existingIds = new Set(existing.map(r => r.sourceId));

  // Register default MacCMS sources
  for (const source of DEFAULT_MACCMS_SOURCES) {
    if (!existingIds.has(source.sourceId)) {
      mediaSourceManager.addRegistration({
        sourceId: source.sourceId,
        factoryId: 'maccms',
        config: {
          arguments: {
            baseUrl: source.baseUrl,
            name: source.name,
          },
        },
        enabled: true,
      });
    }
  }

  // Register DMHY (single instance, auto)
  if (!existingIds.has('dmhy')) {
    mediaSourceManager.addRegistration({
      sourceId: 'dmhy',
      factoryId: 'dmhy',
      config: { arguments: {} },
      enabled: true,
    });
  }

  // Register Mikan (single instance, auto)
  if (!existingIds.has('mikan')) {
    mediaSourceManager.addRegistration({
      sourceId: 'mikan',
      factoryId: 'mikan',
      config: { arguments: {} },
      enabled: true,
    });
  }

  // Register LocalCache (single instance, auto, always enabled)
  if (!existingIds.has('local_cache')) {
    mediaSourceManager.addRegistration({
      sourceId: 'local_cache',
      factoryId: 'local_cache',
      config: { arguments: {} },
      enabled: true,
    });
  }
}
