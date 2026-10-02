import typography from '../styles/typography.json';

// Canvas 不消费 SCSS，直接读取同一个配置，避免导出海报另起一套字号。
export function posterFont(role: keyof typeof typography.poster): string {
  const style = typography.poster[role];
  return `${style.weight} ${style.size}px ${typography.families.canvas}`;
}
export function posterLineHeight(role: keyof typeof typography.poster): number {
  return typography.poster[role].lineHeight;
}
