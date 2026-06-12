// src/services/media/MediaSourceManager.ts
import {
  MediaSource,
  MediaSourceFactory,
  MediaFetchRequest,
  MediaMatch,
  SourceConfig,
  MediaSelectorSettings,
} from './types';
import { MediaFetcher } from './MediaFetcher';
import { MediaSelector } from './MediaSelector';

const SOURCES_STORAGE_KEY = 'acg_v2_sources';
const DISABLED_KEY = 'acg_v2_sources_disabled';

interface SourceRegistration {
  sourceId: string;
  factoryId: string;
  config: SourceConfig;
  enabled: boolean;
  order: number;
}

export class MediaSourceManager {
  private factories = new Map<string, MediaSourceFactory>();
  private instances = new Map<string, MediaSource>();

  registerFactory(factory: MediaSourceFactory): void {
    this.factories.set(factory.factoryId, factory);
  }

  getFactories(): MediaSourceFactory[] {
    return Array.from(this.factories.values());
  }

  getFactory(factoryId: string): MediaSourceFactory | undefined {
    return this.factories.get(factoryId);
  }

  getSource(sourceId: string): MediaSource | undefined {
    if (this.instances.has(sourceId)) {
      return this.instances.get(sourceId)!;
    }
    const reg = this.getRegistrations().find(r => r.sourceId === sourceId);
    if (!reg) return undefined;
    const factory = this.factories.get(reg.factoryId);
    if (!factory) return undefined;
    const source = factory.create(reg.sourceId, reg.config);
    this.instances.set(reg.sourceId, source);
    return source;
  }

  getEnabledSources(): MediaSource[] {
    const regs = this.getRegistrations();
    const disabled = this.getDisabledIds();
    return regs
      .filter(r => r.enabled && !disabled.includes(r.sourceId))
      .sort((a, b) => a.order - b.order)
      .map(r => this.getSource(r.sourceId))
      .filter((s): s is MediaSource => s !== undefined);
  }

  /**
   * 创建 MediaFetcher + MediaSelector 组合。
   * 推荐的新 API，支持增量结果和完整过滤流水线。
   */
  createFetcher(
    request: MediaFetchRequest,
    settings?: Partial<MediaSelectorSettings>,
  ): MediaFetcher {
    const selector = new MediaSelector(request, settings);
    return new MediaFetcher(this, request, selector);
  }

  async fetchAll(request: MediaFetchRequest): Promise<{
    results: MediaMatch[];
    errors: { sourceId: string; error: string }[];
  }> {
    const sources = this.getEnabledSources();
    const promises = sources.map(async (source) => {
      try {
        const result = await source.fetch(request);
        return { sourceId: source.sourceId, matches: result.items };
      } catch (err: any) {
        return { sourceId: source.sourceId, error: err.message || '查询失败' };
      }
    });

    const settled = await Promise.allSettled(promises);
    const results: MediaMatch[] = [];
    const errors: { sourceId: string; error: string }[] = [];

    for (const r of settled) {
      if (r.status === 'fulfilled') {
        const val = r.value as any;
        if (val.error) {
          errors.push({ sourceId: val.sourceId, error: val.error });
        } else {
          results.push(...val.matches);
        }
      } else {
        errors.push({ sourceId: 'unknown', error: r.reason?.message || '未知错误' });
      }
    }

    return { results, errors };
  }

  addRegistration(reg: Omit<SourceRegistration, 'order'>): void {
    const regs = this.getRegistrations();
    regs.push({ ...reg, order: regs.length });
    this.saveRegistrations(regs);
  }

  removeRegistration(sourceId: string): void {
    const regs = this.getRegistrations().filter(r => r.sourceId !== sourceId);
    this.saveRegistrations(regs);
    const instance = this.instances.get(sourceId);
    if (instance) {
      instance.close?.();
      this.instances.delete(sourceId);
    }
  }

  toggleSource(sourceId: string): void {
    const disabled = this.getDisabledIds();
    const idx = disabled.indexOf(sourceId);
    if (idx >= 0) disabled.splice(idx, 1);
    else disabled.push(sourceId);
    localStorage.setItem(DISABLED_KEY, JSON.stringify(disabled));
  }

  isDisabled(sourceId: string): boolean {
    return this.getDisabledIds().includes(sourceId);
  }

  getRegistrations(): SourceRegistration[] {
    return JSON.parse(localStorage.getItem(SOURCES_STORAGE_KEY) || '[]');
  }

  private saveRegistrations(regs: SourceRegistration[]): void {
    localStorage.setItem(SOURCES_STORAGE_KEY, JSON.stringify(regs));
  }

  private getDisabledIds(): string[] {
    return JSON.parse(localStorage.getItem(DISABLED_KEY) || '[]');
  }

  closeAll(): void {
    for (const instance of this.instances.values()) {
      instance.close?.();
    }
    this.instances.clear();
  }
}

export const mediaSourceManager = new MediaSourceManager();
