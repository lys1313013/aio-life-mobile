export interface Region {
  code: string;
  name: string;
  level: 1 | 2 | 3 | 4;
  hasChildren: boolean;
}

export function regionName(path: Region[]): string {
  return path.map(item => item.name).filter((name, index, names) => !isGroupingName(name) && (index === 0 || name !== names[index - 1])).join('');
}

export function regionCity(path: Region[]): string | null {
  return path.find(item => item.level === 2 && !isGroupingName(item.name))?.name || path[0]?.name || null;
}

function isGroupingName(name: string): boolean {
  return ['市辖区', '县', '省直辖县级行政区划', '自治区直辖县级行政区划'].includes(name);
}

/** 解析使用行政区上下文；已输入完整地址时不重复拼接。 */
export function regionAddress(path: Region[], address: string): string {
  const name = regionName(path), value = address.trim();
  return !name || value.startsWith(path[0]?.name || '') ? value : name + value;
}
