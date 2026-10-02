// 输入为服务端菜单树的前序展开；搜索保留祖先，避免丢失层级上下文。
export function visibleMenus(rows, expanded, keyword = "") {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const query = keyword.trim().toLocaleLowerCase();
  const included = new Set();
  if (query) {
    for (const row of rows) {
      if (
        ![row.title, row.name, row.path].some((value) =>
          String(value || "")
            .toLocaleLowerCase()
            .includes(query),
        )
      )
        continue;
      let node = row;
      while (node && !included.has(node.id)) {
        included.add(node.id);
        node = byId.get(node.parentId);
      }
    }
    return rows.filter((row) => included.has(row.id));
  }
  return rows.filter((row) => {
    let parent = byId.get(row.parentId);
    const seen = new Set([row.id]);
    while (parent && !seen.has(parent.id)) {
      if (!expanded.includes(parent.id)) return false;
      seen.add(parent.id);
      parent = byId.get(parent.parentId);
    }
    return true;
  });
}

// 同级移动按最终顺序生成唯一 sort，兼容原有负数及重复 sort。
export function menuMoveChanges(rows, row, delta) {
  const peers = rows.filter(
    (item) => (item.parentId || "0") === (row.parentId || "0"),
  );
  const index = peers.findIndex((item) => item.id === row.id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= peers.length) return [];
  peers.splice(target, 0, peers.splice(index, 1)[0]);
  const start = Math.min(...peers.map((item) => Number(item.sort) || 0));
  return peers
    .map((item, offset) => ({ row: item, sort: start + offset }))
    .filter((change) => Number(change.row.sort) !== change.sort);
}
