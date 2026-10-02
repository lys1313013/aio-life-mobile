import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../src/services/form-required.ts', import.meta.url), 'utf8');
export const formRequiredUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;

// 现有契约测试从 data URL 加载源码，为它们解析新增的公共规则依赖。
export function withFormRequired(source) {
  return source.replace(/from\s+(['"])[^'"]*\/form-required\.ts\1/g, `from '${formRequiredUrl}'`);
}
