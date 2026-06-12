// src/services/media/RawTitleParser.ts
// 标题解析器 — 参考 Animeko LabelFirstRawTitleParser + PatternBasedRawTitleParser
// 从字幕组发布的原始标题中提取结构化元数据

import { SubtitleKind } from './types';

export interface ParsedTitle {
  alliance: string;           // 字幕组
  episodeSort: string;        // 集数（系列内）
  resolution: string;         // 分辨率
  subtitleLanguageIds: string[]; // 字幕语言
  subtitleKind?: SubtitleKind;   // 字幕类型
  subjectName?: string;       // 条目名称
  originalTitle: string;      // 原始标题
}

// ==================== 分辨率解析 ====================

const RESOLUTION_PATTERNS: [RegExp, string][] = [
  [/2160[piP]|4K|UHD/i, '4K'],
  [/1440[piP]|2K/i, '2K'],
  [/1080[piP]/i, '1080P'],
  [/720[piP]/i, '720P'],
  [/560[piP]/i, '560P'],
  [/480[piP]/i, '480P'],
  [/360[piP]/i, '360P'],
  [/240[piP]/i, '240P'],
  [/x2160/i, '4K'],
  [/x1080/i, '1080P'],
  [/x720/i, '720P'],
];

function parseResolution(text: string): string {
  for (const [pattern, label] of RESOLUTION_PATTERNS) {
    if (pattern.test(text)) return label;
  }
  return '';
}

// ==================== 字幕语言解析 ====================

const SUBTITLE_LANGUAGE_PATTERNS: [RegExp, string][] = [
  [/简中|简体|简日|GB\b|GBK|CHS|中字|中文|简/, 'CHS'],
  [/繁中|繁体|繁日|BIG5|CHT|TC\b|繁體/, 'CHT'],
  [/粤|Cantonese|粤语/, 'Cantonese'],
  [/日字|日文|JP\b|JPN|日本語/, 'JPN'],
  [/英字|English|ENG|英配/, 'ENG'],
];

function parseSubtitleLanguages(text: string): string[] {
  const languages: string[] = [];
  for (const [pattern, lang] of SUBTITLE_LANGUAGE_PATTERNS) {
    if (pattern.test(text)) {
      languages.push(lang);
    }
  }
  return languages;
}

// ==================== 字幕类型解析 ====================

function parseSubtitleKind(text: string): SubtitleKind | undefined {
  if (/内嵌|內嵌|硬字幕|硬字幕|硬载/.test(text)) return SubtitleKind.EMBEDDED;
  if (/内封|內封|内挂|內掛|软字幕|软载/.test(text)) return SubtitleKind.CLOSED;
  if (/外挂|外掛/.test(text)) return SubtitleKind.EXTERNAL_DISCOVER;
  if (/简繁内封|繁简内封|简繁内嵌|繁简内嵌/.test(text)) return SubtitleKind.CLOSED;
  if (/无中文字幕|无字幕|無字幕/.test(text)) return undefined;
  // 超过2个非日语语言 → 可能是内封
  const langs = parseSubtitleLanguages(text);
  const nonJpn = langs.filter(l => l !== 'JPN');
  if (nonJpn.length >= 2) return SubtitleKind.CLOSED;
  return undefined;
}

// ==================== 集数解析 ====================

function parseEpisode(text: string): string {
  // 匹配 "第X集" "第X话" "EPX" "#X" "X-" " X " 等
  const patterns: [RegExp, number][] = [
    [/第\s*(\d+)\s*[集话話]/, 1],
    [/EP?\s*(\d+)/i, 1],
    [/#\s*(\d+)/, 1],
    [/\[\s*(\d+)\s*[-~]/, 1],    // [01-12]
    [/\[\s*(\d+)\s*\]/, 1],       // [01]
    [/\s(\d{1,3})\s*[-~]\s*\d/, 1], // 01-12
    [/\s(\d{1,3})\s*$/, 1],       // 末尾数字
  ];

  for (const [pattern, group] of patterns) {
    const match = text.match(pattern);
    if (match && match[group]) {
      const num = parseInt(match[group], 10);
      if (num > 0 && num < 2000) {
        return String(num);
      }
    }
  }
  return '';
}

// ==================== LabelFirstRawTitleParser ====================

/**
 * 优先解析标签（方括号/圆括号内容），提取剧集、分辨率、字幕语言等。
 * 不解析标题名，正确率更高。
 * 参考 Animeko LabelFirstRawTitleParser。
 */
export function parseTitleLabelFirst(title: string): ParsedTitle {
  const result: ParsedTitle = {
    alliance: '',
    episodeSort: '',
    resolution: '',
    subtitleLanguageIds: [],
    subtitleKind: undefined,
    originalTitle: title,
  };

  // 提取所有方括号和圆括号标签
  const bracketLabels: string[] = [];
  const bracketRegex = /[\[【（(]([^】\])）]+)[】\])）]/g;
  let match;
  while ((match = bracketRegex.exec(title)) !== null) {
    bracketLabels.push(match[1].trim());
  }

  // 第一个标签通常是字幕组
  if (bracketLabels.length > 0) {
    const firstLabel = bracketLabels[0];
    // 字幕组通常包含 "&" "×" "字幕组" "Sub" 等关键词，或者不包含数字
    if (!/^\d+$/.test(firstLabel) && !/^\d{3,4}[pP]$/.test(firstLabel)) {
      result.alliance = firstLabel;
    }
  }

  // 从所有标签中提取信息
  const allLabelText = bracketLabels.join(' ');
  result.resolution = parseResolution(allLabelText) || parseResolution(title);
  result.subtitleLanguageIds = parseSubtitleLanguages(allLabelText);
  result.subtitleKind = parseSubtitleKind(allLabelText);

  // 集数：从标签和标题中提取
  result.episodeSort = parseEpisode(allLabelText) || parseEpisode(title);

  return result;
}

// ==================== PatternBasedRawTitleParser ====================

/**
 * 基于正则的模式匹配，尝试解析标题名。
 * 正确率较低，作为回退方案。
 * 参考 Animeko PatternBasedRawTitleParser。
 */
export function parseTitlePatternBased(title: string): ParsedTitle {
  const result = parseTitleLabelFirst(title);

  // 尝试提取标题名：字幕组标签之后、集数之前的部分
  // 格式: [字幕组] 标题名 - 集数 [其他标签]
  const titleMatch = title.match(/[\]））]\s*(.+?)\s*[-–—]\s*(\d+)/);
  if (titleMatch) {
    result.subjectName = titleMatch[1].trim();
  }

  return result;
}

// ==================== 统一入口 ====================

/**
 * 解析标题，默认使用 LabelFirst 解析器。
 */
export function parseRawTitle(title: string, preferPattern = false): ParsedTitle {
  if (preferPattern) {
    return parseTitlePatternBased(title);
  }
  return parseTitleLabelFirst(title);
}
