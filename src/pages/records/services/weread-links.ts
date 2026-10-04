// Scheme 来自微信读书官方 book-detail 页面；使用接口 bookId，不使用网页 hash。
export function wereadAppLink(bookId?: string) {
  return typeof bookId === 'string' && /^[\w-]+$/.test(bookId)
    ? `weread://reading?bId=${encodeURIComponent(bookId)}&style=1` : '';
}

export function wereadWebLink(value?: string) {
  if (typeof value !== 'string' || !/^https:\/\/(?:[a-z0-9-]+\.)*weread\.qq\.com(?::443)?(?:[/?#]|$)/i.test(value)) return '';
  if (!/^https:\/\/[^/]+\/book-detail(?:\?|$)/i.test(value)) return value;
  const query = value.split('?')[1]?.split('#')[0] || '';
  for (const part of query.split('&')) {
    if (part.startsWith('v=')) {
      try {
        const id = decodeURIComponent(part.slice(2));
        return id ? `https://weread.qq.com/web/reader/${encodeURIComponent(id)}` : '';
      } catch { return ''; }
    }
  }
  return '';
}

export function isMobileBrowser(userAgent: string, touchPoints = 0) {
  return /Android|iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && touchPoints > 1);
}

export function wereadBrowserLink(bookId: string, userAgent: string, webLink = '') {
  const scheme = wereadAppLink(bookId);
  if (!scheme) return '';
  if (/Android/i.test(userAgent) && !/MicroMessenger/i.test(userAgent)) {
    const fallback = wereadWebLink(webLink);
    return `intent://reading?bId=${encodeURIComponent(bookId)}&style=1#Intent;scheme=weread;package=com.tencent.weread;${fallback ? `S.browser_fallback_url=${encodeURIComponent(fallback)};` : ''}end`;
  }
  return scheme;
}
