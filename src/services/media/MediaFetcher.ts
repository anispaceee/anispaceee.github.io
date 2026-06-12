// src/services/media/MediaFetcher.ts
// 资源查找器 — 参考 Animeko MediaFetcher
// 负责并发查询多个 MediaSource，逐源将结果推入 MediaSelector
import { MediaSourceManager } from './MediaSourceManager';
import { MediaSelector } from './MediaSelector';
import { MediaFetchRequest } from './types';

export class MediaFetcher {
  private manager: MediaSourceManager;
  private request: MediaFetchRequest;
  private selector: MediaSelector;
  private errors: { sourceId: string; error: string }[] = [];
  private cancelled = false;
  private promise: Promise<void> | null = null;

  constructor(
    manager: MediaSourceManager,
    request: MediaFetchRequest,
    selector: MediaSelector,
  ) {
    this.manager = manager;
    this.request = request;
    this.selector = selector;
  }

  /**
   * 开始并发查询所有已启用源。
   * 每个源的结果到达后立即推入 MediaSelector，实现增量展示。
   */
  start(): void {
    const sources = this.manager.getEnabledSources();
    this.selector.setSourceCount(sources.length);

    this.promise = (async () => {
      const promises = sources.map(async (source) => {
        if (this.cancelled) return;
        try {
          const result = await source.fetch(this.request);
          if (this.cancelled) return;
          // 增量推入选择器
          this.selector.addMatches(result.items);
        } catch (err: any) {
          if (this.cancelled) return;
          this.errors.push({
            sourceId: source.sourceId,
            error: err.message || '查询失败',
          });
        } finally {
          if (!this.cancelled) {
            this.selector.markSourceCompleted();
          }
        }
      });

      await Promise.allSettled(promises);
    })();
  }

  /** 等待所有源查询完成 */
  async waitForAll(): Promise<void> {
    if (this.promise) {
      await this.promise;
    }
  }

  /** 获取错误列表 */
  getErrors(): { sourceId: string; error: string }[] {
    return [...this.errors];
  }

  /** 取消所有查询 */
  cancel(): void {
    this.cancelled = true;
  }

  /** 获取关联的 MediaSelector */
  getSelector(): MediaSelector {
    return this.selector;
  }
}
