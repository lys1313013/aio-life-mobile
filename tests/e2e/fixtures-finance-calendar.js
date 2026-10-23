function calendarFixture(url, kind, count = 3) {
  const granularity = url.searchParams.get('granularity'); const date = url.searchParams.get('date');
  const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10), year = Number((date || today).slice(0, 4)), month = Number(date?.slice(5) || 1) - 1;
  const amount = count ? (kind === 'finance' ? 10000 : kind === 'income' ? 12345.67 : 2345.67) : 0, buckets = [], iso = value => value.toISOString().slice(0, 10);
  const add = (start, end, label) => buckets.push({ key: iso(start), startDate: iso(start), endDate: iso(end), label, amount: buckets.length ? 0 : amount, future: iso(start) > today });
  if (granularity === 'day' || granularity === 'week') {
    const cursor = new Date(Date.UTC(year, month, 1)), end = new Date(Date.UTC(year, month + 1, 1));
    while (cursor < end) { const start = new Date(cursor); cursor.setUTCDate(cursor.getUTCDate() + (granularity === 'day' ? 1 : 7 - (cursor.getUTCDay() + 6) % 7)); if (cursor > end) cursor.setTime(end.getTime()); add(start, cursor, granularity === 'day' ? String(start.getUTCDate()) : '第' + (buckets.length + 1) + '周'); }
  } else if (granularity === 'month') for (let index = 0; index < 12; index++) add(new Date(Date.UTC(year, index, 1)), new Date(Date.UTC(year, index + 1, 1)), (index + 1) + '月');
  else for (let index = year - 2; index <= year; index++) add(new Date(Date.UTC(index, 0, 1)), new Date(Date.UTC(index + 1, 0, 1)), index + '年');
  if (kind === 'finance') for (const [index, row] of buckets.entries()) Object.assign(row, { income: index || !count ? 0 : 12345.67, expense: index || !count ? 0 : 2345.67, balance: row.amount });
  return { granularity, date, today, amount, ...(kind === 'finance' ? { income: count ? 12345.67 : 0, expense: count ? 2345.67 : 0, balance: amount } : {}), buckets, refreshInterval: 300 };
}
module.exports = { calendarFixture };
