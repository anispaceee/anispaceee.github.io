// src/services/media/initSources.ts
import { mediaSourceManager } from './MediaSourceManager';
import { MacCMSSourceFactory, DEFAULT_MACCMS_SOURCES } from './sources/MacCMSSource';
import { DmhySourceFactory } from './sources/DmhySource';
import { MikanSourceFactory } from './sources/MikanSource';
import { LocalCacheSourceFactory } from './sources/LocalCacheSource';
import { SelectorSourceFactory, DEFAULT_SELECTOR_PRESETS } from './sources/SelectorSource';
import { RSSSourceFactory, DEFAULT_RSS_PRESETS } from './sources/RSSSource';

let initialized = false;

// 已知失效的源 ID，需要从 localStorage 中清理
const DEPRECATED_SOURCE_IDS = ['kuapi', 'guangsu', 'sdzy'];

export function initMediaSources(): void {
  if (initialized) return;
  initialized = true;

  // Register factories
  mediaSourceManager.registerFactory(new MacCMSSourceFactory());
  mediaSourceManager.registerFactory(new DmhySourceFactory());
  mediaSourceManager.registerFactory(new MikanSourceFactory());
  mediaSourceManager.registerFactory(new LocalCacheSourceFactory());
  mediaSourceManager.registerFactory(new SelectorSourceFactory());
  mediaSourceManager.registerFactory(new RSSSourceFactory());

  // Clean up deprecated sources from localStorage
  for (const depId of DEPRECATED_SOURCE_IDS) {
    const existing = mediaSourceManager.getRegistrations();
    if (existing.some(r => r.sourceId === depId)) {
      mediaSourceManager.removeRegistration(depId);
      console.log(`[MediaSource] 清理失效源: ${depId}`);
    }
  }

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

  // Register Selector sources (online streaming sites)
  for (const preset of DEFAULT_SELECTOR_PRESETS) {
    if (!existingIds.has(preset.sourceId)) {
      mediaSourceManager.addRegistration({
        sourceId: preset.sourceId,
        factoryId: 'web-selector',
        config: { arguments: { presetId: preset.sourceId } },
        enabled: true,
      });
    }
  }

  // Register RSS sources (BT feeds)
  for (const preset of DEFAULT_RSS_PRESETS) {
    if (!existingIds.has(preset.sourceId)) {
      mediaSourceManager.addRegistration({
        sourceId: preset.sourceId,
        factoryId: 'rss',
        config: { arguments: { presetId: preset.sourceId } },
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

  console.log('[MediaSource] 初始化完成, 已注册源:', mediaSourceManager.getRegistrations().map(r => r.sourceId));
}
