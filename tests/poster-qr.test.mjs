import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import test from 'node:test'
import assert from 'node:assert/strict'
const source=await readFile(new URL('../src/pages/personality/services/poster-qr.ts',import.meta.url),'utf8'),{qrMatrix,posterSiteUrl,drawPosterQr}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))
const Original=createRequire(import.meta.url)('qrcode-terminal/vendor/QRCode')
test('二维码内容与Web相同站点/profile?tab=cbti，拒绝无效地址',()=>{assert.equal(posterSiteUrl('https://aiolife.top/#/pages/personality/cbti'),'https://aiolife.top/profile?tab=cbti');assert.equal(posterSiteUrl('http://127.0.0.1:5180/#/pages/personality/cbti'),'http://127.0.0.1:5180/profile?tab=cbti');assert.throws(()=>posterSiteUrl('javascript:alert(1)'))})
test('纯计算二维码矩阵与既有标准编码逐点一致，含多个长度与UTF8 URL',()=>{for(const site of ['https://aiolife.top/profile?tab=cbti','http://127.0.0.1:5180/profile?tab=cbti','https://example.com/'+('a'.repeat(300)),'https://example.com/中文']){const original=new Original(-1,0);original.addData(encodeURI(site));original.make();assert.deepEqual(qrMatrix(site),original.modules)}})
test('Canvas整数像素绘制并保留4模块静区，不依赖DOM/网络',()=>{const calls=[],ctx={fillStyle:'',fillRect(...rect){calls.push([this.fillStyle,...rect])}},url='https://aiolife.top/profile?tab=cbti',matrix=qrMatrix(url),size=drawPosterQr(ctx,url,48,1070);assert.equal(calls[0][0],'#ffffff');assert.equal(calls.length,1+matrix.flat().filter(Boolean).length);assert.ok(size<=144);for(const rect of calls.slice(1)){assert.equal(rect[0],'#f97316');assert.ok(rect[1]>48&&rect[2]>1070);assert.equal(Number.isInteger(rect[1]),true);assert.equal(rect[3],rect[4])}})
