// API、腾讯 GL SDK 和底图均使用模拟数据；真实地图另行联调。
function initialRecords() {
  return [
    ['9223372036854775805', '2016-01-01', '2019-06-01', '丁香公寓', 120.127128, 30.273297],
    ['9223372036854775806', '2019-07-01', '2023-04-01', '文三路254号院', 120.129779, 30.279610],
    ['9223372036854775807', '2023-05-01', '9999-12-31', '跑马场巷小区', 120.133886, 30.270607],
  ].map(([id, startDate, endDate, placeName, longitude, latitude]) => ({ id, startDate, endDate, placeName, longitude, latitude,
    address: '杭州市西湖区 · ' + placeName,
    coordinateSystem: 'GCJ02', city: '杭州', providerUid: 'synthetic-poi-' + id, remark: '模拟备注：在这里生活过。' }));
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
  // Tencent SDK 替身仅用于离线 E2E；真实地图由本地页面人工验证。
  await page.route('https://map.qq.com/api/gljs?**', route => {
    state.tencentRequests ??= []; state.tencentRequests.push(route.request().url());
    if (state.failSdk) return route.abort();
    const callback = new URL(route.request().url()).searchParams.get('callback');
    return route.fulfill({ contentType: 'application/javascript', body: `
      let mapSequence=0;
      class FixtureMap {
        constructor(el, options) { this.el=el;this.center=options.center;this.zoom=options.zoom;this.events={};this.click=e=>{const bounds=el.getBoundingClientRect();const scale=256*2**this.zoom;this.emit('click',{latLng:{lat:this.center.lat-(e.clientY-bounds.top-el.clientHeight/2)/scale*360,lng:this.center.lng+(e.clientX-bounds.left-el.clientWidth/2)/scale*360}})};el.addEventListener('click',this.click);this.canvas=document.createElement('canvas');this.canvas.dataset.mapInstance=String(++mapSequence);this.canvas.dataset.zoom=String(this.zoom);this.canvas.className='tencent-fixture-canvas';this.canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;z-index:2';el.append(this.canvas);this.wheel=e=>{e.preventDefault();this.setZoom(Math.max(3,Math.min(20,this.zoom+(e.deltaY<0?1:-1))))};el.addEventListener('wheel',this.wheel,{passive:false});setTimeout(()=>this.tiles(),0); }
        on(event,callback) { (this.events[event]??=[]).push(callback); }
        emit(event,data) { for(const callback of this.events[event]||[])callback(data); }
        async tiles() { try { const r=await fetch('https://footprint-tiles.test/0/0/0.svg');if(!r.ok)throw Error();this.canvas.dataset.ready='true';this.emit('tilesloaded'); } catch { this.emit('context_lost'); } }
        getZoom(){return this.zoom}setZoom(z){this.zoom=z;this.canvas.dataset.zoom=String(z);this.emit('zoom');this.tiles()}
        setCenter(p){this.center=p;this.emit('pan')}
        setPitch(){this.emit('pitch')}setRotation(){this.emit('rotate')}
        projectToContainer(p){const scale=256*2**this.zoom;const y=lat=>{const sin=Math.sin(Math.max(-85,Math.min(85,lat))*Math.PI/180);return .5-Math.log((1+sin)/(1-sin))/(4*Math.PI)};return {x:this.el.clientWidth/2+(p.lng-this.center.lng)/360*scale,y:this.el.clientHeight/2+(y(p.lat)-y(this.center.lat))*scale}}
        fitBounds(b){this.center={lat:(Math.min(...b.points.map(p=>p.lat))+Math.max(...b.points.map(p=>p.lat)))/2,lng:(Math.min(...b.points.map(p=>p.lng))+Math.max(...b.points.map(p=>p.lng)))/2};this.zoom=16;this.emit('zoom')}
        destroy(){this.el.removeEventListener('wheel',this.wheel);this.el.removeEventListener('click',this.click);this.events={};this.canvas.remove()}
      }
      window.TMap={Map:FixtureMap,LatLng:class{constructor(lat,lng){this.lat=lat;this.lng=lng}},LatLngBounds:class{constructor(a,b){this.points=[a,b]}extend(p){this.points.push(p)}}};window['${callback}']();
    ` });
  });
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
    if (path === '/life-footprints/map/config') data = { tencent: { enabled: state.tencentEnabled !== false, mapStyleId: 'style1' }, searchEnabled: state.searchEnabled, coordinateSystem: 'GCJ02', tiles: { url: 'https://footprint-tiles.test/{z}/{x}/{y}.svg', attribution: '模拟底图', attributionUrl: '', coordinateSystem: 'WGS84' } };
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
