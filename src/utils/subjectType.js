/** Bangumi 条目类型相关工具，供 Wiki 与终端命令注册表共用 */

/** 根据 Bangumi type 数值返回详情页路由 typeKey */
export function typeToKey(type) {
  return type === 1 ? 'novel' : type === 3 ? 'music' : type === 4 ? 'game' : type === 6 ? 'real' : 'anime';
}

/** 从搜索结果项提取基本信息，作为 navigate state 传给详情页 */
export function extractPreview(item) {
  return {
    id: item.id,
    name: item.name || '',
    name_cn: item.name_cn || '',
    type: item.type,
    image: item.images?.large || item.images?.common || item.image || '',
    images: item.images || {},
  };
}
