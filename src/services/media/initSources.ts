// src/services/media/initSources.ts
import { mediaSourceManager } from './MediaSourceManager';
import { MacCMSSourceFactory, DEFAULT_MACCMS_SOURCES } from './sources/MacCMSSource';

let initialized = false;

export function initMediaSources(): void {
  if (initialized) return;
  initialized = true;

  mediaSourceManager.registerFactory(new MacCMSSourceFactory());

  const existing = mediaSourceManager.getRegistrations();
  const existingIds = new Set(existing.map(r => r.sourceId));

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
}
