// 必填标记和保存校验共用字段规则；范围、格式、跨字段校验仍由业务负责。
const fields = {
  weread: ['keyInput'],
  member: ['name', 'expiryDate'],
  device: ['name'],
  honor: ['title', 'honorDate'],
  anniversary: ['title', 'targetDate'],
  milestone: ['title', 'date'],
  activity: ['performanceName', 'performer', 'venue'],
  video: ['title', 'url'],
  library: ['title'],
  exercise: ['exerciseTypeId', 'exerciseDate'],
  feedback: ['title', 'content'],
  thought: ['content'],
  memo: ['title', 'content'],
  recordCategory: ['dictLabel'],
  category: ['name', 'color'],
  wardrobe: ['name'],
  goal: ['title', 'type', 'status'],
  column: ['title'],
  task: ['content'],
  detail: ['content', 'priority'],
  person: ['name'],
  relation: ['targetPersonId'],
  income: ['amt', 'incDate'],
  expense: ['amt', 'transactionAmt', 'expTypeId', 'payTypeId', 'expTime'],
  importExpense: ['expTypeId', 'payTypeId'],
  cardTag: ['name'],
  apiKey: ['remark'],
  password: ['oldPassword', 'password', 'confirm'],
  personality: ['code', 'name', 'vector'],
  message: ['receiver', 'content'],
  comment: ['comment'],
  reply: ['content'],
};

export function requiredFields(kind, form = {}) {
  if (kind === 'llm') return ['modelName', 'baseUrl', ...(form.id ? [] : ['apiKey'])];
  if (kind === 'binding') return ['platform', ...(form.platform === 'weread'
    ? (form.id ? [] : ['accessToken']) : ['platformUsername'])];
  if (kind === 'card') return [form.bankId ? 'bankId' : 'customBankName'];
  if (kind === 'security') return ['password', ...(form.mode === 'menus' ? [] : ['confirmation']),
    ...(form.mode === 'recovery' ? ['code'] : []),
    ...(form.mode === 'password' && form.hasPassword ? ['oldPassword'] : [])];
  if (kind === 'vaultUnlock') return ['password', ...(form.initialized ? [] : ['confirm'])];
  if (kind === 'vault') return ['title', 'password'];
  return fields[kind] || [];
}

export function isRequired(kind, field, form = {}) {
  return requiredFields(kind, form).includes(field);
}

export function missingRequired(kind, form, field = '') {
  const keys = field ? requiredFields(kind, form).filter(key => key === field) : requiredFields(kind, form);
  return keys.some(key => {
    const value = form[key];
    // 密码不 trim；0 和 false 是合法填写值，不按 truthy 判断。
    const password = ['password', 'oldPassword', 'confirm', 'confirmation'].includes(key);
    return value == null || (typeof value === 'string' && (password ? value : value.trim()) === '');
  });
}
