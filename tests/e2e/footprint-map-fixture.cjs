// API 和底图为模拟数据；地图交互使用真实 Leaflet，不安装百度 SDK 替身。
function initialRecords() {
  return [
    ['9223372036854775805', '2016-01-01', '2019-06-01', '丁香公寓', 120.127128, 30.273297],
    ['9223372036854775806', '2019-07-01', '2023-04-01', '文三路254号院', 120.129779, 30.279610],
    ['9223372036854775807', '2023-05-01', '9999-12-31', '跑马场巷小区', 120.133886, 30.270607],
  ].map(([id, startDate, endDate, placeName, longitude, latitude]) => ({ id, startDate, endDate, placeName, longitude, latitude,
    address: '杭州市西湖区 · ' + placeName,
    coordinateSystem: 'GCJ02', city: '杭州', providerUid: 'synthetic-poi-' + id, note: '模拟备注：在这里生活过。' }));
}

async function setupMapFixture(page, options = {}) {
  const regions = [
    { code: '33', name: '浙江省', level: 1, hasChildren: true, parent: null },
    { code: '3301', name: '杭州市', level: 2, hasChildren: true, parent: '33' },
    { code: '330106', name: '西湖区', level: 3, hasChildren: true, parent: '3301' },
    { code: '330106012', name: '三墩镇', level: 4, hasChildren: false, parent: '330106' },
    { code: '11', name: '北京市', level: 1, hasChildren: true, parent: null },
    { code: '1101', name: '市辖区', level: 2, hasChildren: false, parent: '11' },
  ];
  const state = { records: initialRecords(), writes: [], reads: 0, failSave: false, failRead: false, failRegions: false, regionCalls: [], geocodes: [], failTiles: false, invalidTileRequests: [], searchEnabled: true, delay: 0, searches: [], sdkRequests: [], ...options };
  await page.route('https://api.map.baidu.com/**', route => { state.sdkRequests.push(route.request().url()); return route.abort(); });
  await page.route('https://footprint-tiles.test/**', route => {
    const url = new URL(route.request().url());
    const [z, x, y] = url.pathname.slice(1).replace(/\.svg$/, '').split('/').map(Number);
    if (![z, x, y].every(Number.isInteger) || z < 0 || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) {
      state.invalidTileRequests.push(url.pathname);
      return route.fulfill({ status: 400, body: 'Tile coordinates out of range' });
    }
    return state.failTiles ? route.abort() : route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e3e8eb"/><path d="M0 64H256M0 192H256M64 0V256M192 0V256" stroke="#b5bfc8"/><text x="10" y="25" fill="#64748b" font-size="12">模拟底图</text></svg>' });
  });
  state.handle = async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname.replace(/^\/api/, '');
    if (path.startsWith('/system/regions')) {
      state.regionCalls.push(path + url.search);
      if (state.failRegions) { await route.fulfill({ json: { code: 1, message: '模拟地区读取失败' } }); return true; }
      const code = path.split('/')[3];
      let selected = [];
      if (code) { let item = regions.find(region => region.code === code); while (item) { selected.unshift(item); item = regions.find(region => region.code === item.parent); } }
      const data = code ? selected : regions.filter(region => region.parent === url.searchParams.get('parentCode'));
      await route.fulfill({ json: { code: 0, message: null, data: data.map(({ parent, ...region }) => region) } }); return true;
    }
    if (!path.startsWith('/life-footprints')) return false;
    let data;
    if (path === '/life-footprints/map/config') data = { searchEnabled: state.searchEnabled, coordinateSystem: 'GCJ02', tiles: { url: 'https://footprint-tiles.test/{z}/{x}/{y}.svg', attribution: '模拟底图', attributionUrl: '', coordinateSystem: 'WGS84' } };
    else if (path === '/life-footprints/map/search') {
      const keyword = url.searchParams.get('keyword'); state.searches.push(keyword);
      if (keyword === '旧搜索') await new Promise(resolve => setTimeout(resolve, 850));
      data = [{ placeName: keyword === '新搜索' ? '新搜索结果' : '新增住所', address: '杭州市示例地址', city: '杭州', longitude: 120.131, latitude: 30.278, coordinateSystem: 'GCJ02', providerUid: 'synthetic-search', precise: true, level: 'POI' }];
    } else if (path === '/life-footprints/map/reverse') {
      if (!url.searchParams.has('longitude') || !url.searchParams.has('latitude')) throw new Error('经纬度被请求过滤器丢弃');
      data = { placeName: '地图选点', address: '手动选点地址', city: '杭州', longitude: Number(url.searchParams.get('longitude')), latitude: Number(url.searchParams.get('latitude')), coordinateSystem: 'GCJ02', providerUid: null, precise: true, level: '选点' };
    } else if (path === '/life-footprints/map/geocode') { state.geocodes.push(url.searchParams.get('address')); data = { placeName: '地址解析结果', address: '杭州市示例地址', city: '杭州', longitude: 120.132, latitude: 30.279, coordinateSystem: 'GCJ02', providerUid: null, precise: false, level: '道路' }; }
    else if (req.method() === 'GET') {
      state.reads++; if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay));
      if (state.failRead) { await route.fulfill({ json: { code: 1, message: '模拟读取失败' } }); return true; }
      data = state.records;
    } else if (req.method() === 'DELETE') {
      const id = path.split('/').at(-1);
      if (url.searchParams.has('version')) throw new Error('删除请求不应携带版本');
      state.records = state.records.filter(r => r.id !== id); data = null;
    } else {
      const payload = req.postDataJSON(); state.writes.push(payload);
      if ('id' in payload || 'confirmed' in payload || 'userId' in payload) throw new Error('提交了界面或身份字段');
      if (state.failSave) { await route.fulfill({ json: { code: 1, message: '模拟保存失败' } }); return true; }
      const id = req.method() === 'POST' ? String(9223372036854775000n + BigInt(state.writes.length)) : path.split('/').at(-1);
      if (Object.hasOwn(payload, 'version')) throw new Error('保存请求不应携带版本');
      data = { ...payload, id };
      state.records = [...state.records.filter(r => r.id !== id), data];
    }
    await route.fulfill({ json: { code: 0, message: null, data } }); return true;
  };
  return state;
}
module.exports = { initialRecords, setupMapFixture };
