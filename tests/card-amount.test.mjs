import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';
const source = await readFile(new URL('../src/pages/finance/services/card-amount.ts', import.meta.url), 'utf8');
const { code } = await transform(source, { loader: 'ts', format: 'esm' });
const { cardAmountText } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
test('余额与额度区分未记录和零，不损失大金额精度', () => {
  assert.equal(cardAmountText({ cardType: 'debit' }), '余额：未记录');
  assert.equal(cardAmountText({ cardType: 'debit', balance: null }), '余额：未记录');
  assert.equal(cardAmountText({ cardType: 'debit', balance: '0.00' }), '余额：0 元');
  assert.equal(cardAmountText({ cardType: 'debit', balance: '9999999999999999.99' }), '余额：9,999,999,999,999,999.99 元');
  assert.equal(cardAmountText({ cardType: 'credit', creditLimit: '50000.50', balance: '123' }), '信用额度：50,000.5 元');
  assert.equal(cardAmountText({ cardType: 'credit', creditLimit: 0 }), '信用额度：0 元');
});
