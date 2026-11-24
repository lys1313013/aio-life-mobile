import { parseAst } from 'rollup/parseAst';

function hasNullStyle(node) {
  if (node.type === 'ConditionalExpression') {
    return hasNullStyle(node.consequent) || hasNullStyle(node.alternate);
  }
  return (node.type === 'Literal' && node.value === null)
    || (node.type === 'Identifier' && node.name === 'undefined')
    || (node.type === 'UnaryExpression' && node.operator === 'void');
}

export function assertAndroidStyles(service) {
  const nodes = [parseAst(service)];
  const failures = [];
  while (nodes.length) {
    const node = nodes.pop();
    if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression'
      && node.callee.property.name === 'setSharedDataStyle' && node.arguments[2]
      && hasNullStyle(node.arguments[2])) {
      const line = service.slice(0, node.start).split('\n').length;
      failures.push(`app-service.js:${line}`);
    }
    for (const child of Object.values(node)) {
      if (Array.isArray(child)) {
        for (const item of child) if (item?.type) nodes.push(item);
      } else if (child?.type) nodes.push(child);
    }
  }
  if (failures.length) {
    throw new Error(`Android Vapor 动态样式不能传入 null 或 undefined。请用空对象表示无样式：\n${failures.reverse().join('\n')}`);
  }
}
