// 保存的配色名称与 Web 相同；移动卡片使用适合白字的同色系渐变。
const palettes: Record<string, string[]> = {
  'from-pink-400 to-rose-500': ['#ae3478', '#b52048'],
  'from-cyan-400 to-blue-500': ['#08708a', '#2155a9'],
  'from-orange-400 to-red-500': ['#a04f12', '#ac3237'],
  'from-purple-400 to-indigo-500': ['#8643ad', '#4e46a6'],
  'from-emerald-400 to-teal-500': ['#177052', '#086b69'],
  'from-gray-700 to-gray-900': ['#374151', '#111827'],
};
export const anniversaryColors = Object.keys(palettes);
export function anniversaryCardStyle(color: string) {
  const [start, end] = palettes[color] || palettes[anniversaryColors[0]];
  return { backgroundColor: end, backgroundImage: `linear-gradient(135deg, ${start}, ${end})` };
}
