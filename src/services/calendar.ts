// 日历按本地年月日计算，不用 UTC 字符串解析，避免跨时区偏移。
export function calendarDate(year: number, month: number, day: number) {
  return String(year).padStart(4, '0') + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
}
export function calendarToday() {
  const now = new Date();
  return calendarDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}
export function validCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  return year >= 1000 && year <= 9999 && month >= 1 && month <= 12 && day >= 1 && day <= new Date(year, month, 0).getDate();
}
export function calendarMonth(year: number, month: number) {
  const offset = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(year, month - 1, 1 - offset + index);
    return { value: calendarDate(day.getFullYear(), day.getMonth() + 1, day.getDate()), day: day.getDate(), outside: day.getMonth() !== month - 1 };
  });
}
export function calendarBounds(start: string, end: string, fields: string) {
  const first = fields === 'month' && /^\d{4}-\d{2}$/.test(start) ? start + '-01' : start;
  const last = fields === 'month' && /^\d{4}-\d{2}$/.test(end)
    ? end + '-' + new Date(Number(end.slice(0, 4)), Number(end.slice(5, 7)), 0).getDate() : end;
  return { start: validCalendarDate(first) ? first : '1000-01-01', end: validCalendarDate(last) ? last : '9999-12-31' };
}
export function calendarPeriodAllowed(first: string, last: string, start: string, end: string) {
  return start <= end && first <= end && last >= start;
}
