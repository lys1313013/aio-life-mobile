/** 只使用记录颜色生成卡面；不下载背景图，也不覆盖用户选定的颜色。 */
export function memberCardStyle(color: unknown, dark: boolean) {
  const value = typeof color === 'string' ? color.trim() : '';
  const hex = /^#[\da-f]{6}$/i.test(value)
    ? value.slice(1)
    : /^#[\da-f]{3}$/i.test(value)
      ? value.slice(1).split('').map(part => part + part).join('')
      : '1677ff';
  const channels = [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
  const base = dark ? [28, 31, 37] : [255, 255, 255];
  function tint(weight: number) {
    return '#' + channels.map((channel, index) =>
      Math.round(base[index] * (1 - weight) + channel * weight).toString(16).padStart(2, '0'),
    ).join('');
  }
  return {
    backgroundColor: tint(dark ? 0.10 : 0.05),
    backgroundImage: `linear-gradient(to bottom right, ${tint(dark ? 0.04 : 0.01)}, ${tint(dark ? 0.22 : 0.12)})`,
    borderColor: tint(dark ? 0.25 : 0.14),
  };
}
