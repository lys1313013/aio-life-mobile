/** 金额以十进制字符串处理，避免大金额的分位精度丢失；兼容旧版数字额度。 */
export function cardAmountText(card: { cardType: string; balance?: string | null; creditLimit?: string | number | null }) {
  const credit = card.cardType === 'credit';
  const label = credit ? '信用额度' : '余额';
  const value = credit ? card.creditLimit : card.balance;
  if (value == null || value === '') return label + '：未记录';
  const [integer, fraction = ''] = String(value).split('.');
  const decimals = fraction.replace(/0+$/, '');
  return label + '：' + integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (decimals ? '.' + decimals : '') + ' 元';
}
