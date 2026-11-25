/** 只使用记录颜色生成卡面；不下载背景图，也不覆盖用户选定的颜色。 */
export function memberCardStyle(color: unknown, dark: boolean) {
  const value = typeof color === 'string' ? color.trim() : '';
  const hex = /^#[\da-f]{6}$/i.test(value)
    ? value.slice(1)
    : /^#[\da-f]{3}$/i.test(value)
      ? value.slice(1).split('').map(part => part + part).join('')
      : '1677ff';
  const channels = [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
  const rgb = channels.join(', ');
  const gradient = dark
    ? `linear-gradient(to bottom right, rgba(229, 242, 255, 0.12), transparent 52%, rgba(${rgb}, 0.14))`
    : `linear-gradient(to bottom right, rgba(255, 255, 255, 0.24), transparent 52%, rgba(${rgb}, 0.12))`;
  return { backgroundImage: gradient };
}
