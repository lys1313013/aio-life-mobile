from pathlib import Path
import json, shutil
BASE=Path.cwd(); OUT=BASE/'test-results/page-audit/records'; BACK=Path('/tmp/qa-records-evidence'); OUT.mkdir(parents=True,exist_ok=True)
for p in BACK.iterdir():
 if p.is_file(): shutil.copy2(p,OUT/p.name)
commands={'core':'npx playwright test tests/e2e/qa-records-all-pages.spec.js --workers=1 --output=test-results/page-audit/records-run --reporter=line','filters':'npx playwright test tests/e2e/qa-records-all-pages.spec.js --workers=1 --output=test-results/page-audit/records-run --reporter=line --grep 首页筛选弹层','final':'npx playwright test tests/e2e/qa-records-all-pages.spec.js --workers=1 --output=test-results/page-audit/records-run --reporter=line --grep "点击验收 anniversary|交叉布局"'}
cases=[('todo','tasks/todo','tasks'),('goals','tasks/goals','tasks'),('think','records/notes?kind=think','notes'),('memo','records/notes?kind=memo','notes'),('anniversary','records/anniversary','events'),('milestones','records/milestones','events'),('honor','records/honor','honor'),('feedback','records/feedback','feedback'),('movie','records/library?kind=movie','media'),('read','records/library?kind=read','media'),('exercise','records/exercise','exercise'),('categories','records/categories','exercise'),('activity','records/activity','goods'),('video','records/video','video'),('weread','records/weread','weread'),('devices','goods/devices','goods'),('wardrobe','goods/wardrobe','wardrobe'),('member','member/index','member')]
variants=['390 light','390 dark','768 light','768 dark','1440 light','1440 dark']; pages=[]; image_rows=[]
for key,route,service in cases:
 runs=[]
 for variant in variants:
  width,theme=variant.split(); prefix='' if variant in ['390 light','768 dark'] else 'cross-'; file=OUT/f'{prefix}{key}-{width}-{theme}.json'
  if file.exists(): runs.append(json.loads(file.read_text()))
 filter_file=OUT/f'filter-{key}.json'
 filter_run=json.loads(filter_file.read_text()) if filter_file.exists() else None
 evidence=[e for r in runs for e in r['evidence']]
 if filter_run: evidence+=filter_run['evidence']
 missing=[e['file'] for e in evidence if not (BASE/e['file']).exists()]
 page={'route':'/pages/'+route,'variants':variants,'checks':[{'name':r['test'],'status':r['status'],'assertions':r.get('checks',[]),'command':commands['final'] if r['test'].startswith('交叉') or key=='anniversary' else commands['core']} for r in runs],'evidence':evidence,'status':'passed-ui' if len(runs)==6 and not missing else 'incomplete','issues':[],'source':{'page':'src/pages/'+route.split('?')[0]+'.uvue','service':'src/services/'+('wardrobe/index.ts' if service=='wardrobe' else 'records/'+service+'.ts')}}
 if missing:page['issues'].append({'missingEvidence':missing})
 if filter_run:
  page['checks'].append({'name':filter_run['test'],'status':filter_run['status'],'assertions':filter_run.get('checks',[]),'command':commands['filters'],'pickerCount':filter_run['pickerCount']})
  for e in filter_run['evidence']:image_rows.append((key,filter_run['test'],e['layer'],e['file']))
 pages.append(page)
 for r in runs:
  for e in r['evidence']:image_rows.append((key,r['test'],e['layer'],e['file']))
extra={}
for name in ['nested-390-light','nested-768-dark','save-recovery','async-390','async-768']:
 p=OUT/(name+'.json')
 if p.exists():extra[name]=json.loads(p.read_text())
report={'pages':pages,'extra':extra,'physicalPageCount':16,'modeCount':18,'layoutCount':108,'commands':commands,'limitations':['仅localhost mock；外部请求全部拦截；不代表真实后端、微信或App真机通过','主要新增弹窗打开/取消；并未逐页执行新增成功及删除成功闭环','未逐页覆盖空数据与加载失败重试','附件原生文件选择面板、真实上传、第三方解析/导入执行未验','JavaScript pageerror主36矩阵断言通过；并未将所有console.error列为独立断言']}
(BASE/'test-results/page-audit/records-coverage.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
lines=['# A组移动页面逐项UI验收','', '本轮从模拟登录后的原生生活tab点击各功能入口；运动分类从运动页面“分类配置”进入。没有直接goto业务路由。16物理页面、18业务模式，覆盖390/768/1440深浅6布局共108页面布局；主矩阵36项、二级2项、13模式编辑恢复集中1项、延迟详情2项、交叉布局72项，加手机主页面筛选18项，共131个独立测试名称，均有最终通过结果。','', '## 命令与结果','', '主矩阵最终运行41项：39通过，纪念日2项因测试未先关闭更多菜单失败。修正真实菜单点击顺序后，最终补跑纪念日2项与72交叉布局；结果见完整日志。不是将上一轮作者报告作为通过依据。','', '```bash',commands['core'],commands['final'],commands['filters'],'```','', '日志：`/tmp/qa-records-complete.log`、`/tmp/qa-records-layout-final.log`、`/tmp/qa-records-filters-final.log`。最终74项和补充筛选18项全部通过。主41项日志是在追加布局/筛选测试之前执行该文件的结果。全部fixture ID为字符串，包括`9223372036854775807`。','', '## 已修复','', '- 本组15个有max-width与margin:auto的业务根容器补width:100%和border-box，修平板内容缩窄。','- exercise/categories/activity/video/weread通用page类改为业务独立根类，防App全局.page浅色背景与flex/min-height污染，特别修复运动和分类配置的暗色浅底。','- 待办/反馈详情保留一个关闭入口，移除默认重复关闭。','- 待办/反馈/微信读书详情绑定contentKey；与主Agent的AdaptiveModal ResizeObserver共同修复异步详情测高。延迟800ms返回后，待办358px、反馈504px，390及768均断言>350。','- 主Agent修复共享图标水平居中；本组实际截图复核。纪念日新卡片/更多菜单/浮动新增来自其他授权并发修改，本组保留并适配UI流程。','', '## 每页模式/主要弹窗覆盖','', '| 模式 | 源码页 | 6布局 | 主要证据数 | 状态 |','|---|---|---:|---:|---|']
for p in pages: lines.append(f"| {p['route']} | `{p['source']['page']}` | 6 | {len(p['evidence'])} | {p['status']} |")
lines+=['','待办二级：编辑任务、新增明细、编辑明细、删除明细确认；衣柜分类：新增、编辑、删除确认；微信读书：书架详情、跳转笔记和划线关联想法。390及768均真实按钮操作。','', '13模式保存失败恢复：目标、闪念、笔记、纪念日、里程碑、荣誉、观影、阅读、运动、活动、视频、设备、会员。失败保留输入，成功关闭，断言string ID与parentId/events/hiddenContent/note/end_date/issuer/doubanSubjectId/timeId/orderNumber/pagesInfo/spec/autoRenew等原关联字段。详见`save-recovery.json`。','', '18模式主页面所有30个picker（筛选、日期和图表查看选择器）已逐个打开、截图、取消；取消后值不变。无picker的页面明确记录0。','', '## 每个截图/弹出层证据','', '| 模式 | 精准测试名称 | 层/位置 | 截图 |','|---|---|---|---|']
for key,test,layer,file in image_rows: lines.append(f'| {key} | {test} | {layer} | [{Path(file).name}]({BASE/file}) |')
for name,data in extra.items():
 for e in data.get('evidence',[]):lines.append(f"| 二级 | {name} | {e['layer']} | [{Path(e['file']).name}]({BASE/e['file']}) |")
 for e in data.get('checks',[]):
  if 'file' in e:lines.append(f"| 延迟详情 | {name} | {e['title']} height={e['height']} | [{Path(e['file']).name}]({BASE/e['file']}) |")
lines+=['','## 验证边界与缺口','']+['- '+x for x in report['limitations']]+['','## 实际视觉查看记录','','通过view_image查看390主要页面/新增/编辑/删除确认的13张联系表（73个原始截图），768暗色主要页面/弹窗/底部的15张联系表（85个原始截图），以及修复后的异步待办390、反馈390/768原图。后续最终六布局联系表见visual-reviewed.json，未将只生成截图等同已视觉查看。','', '本组证据即时备份 `/tmp/qa-records-evidence/`，最终恢复至 `aio-life-mobile/test-results/page-audit/records/`。仅本组目录操作，不清理其他组证据。']
DOC=BASE.parent/'docs/mobile-migration/page-audit-records.md';DOC.write_text('\n'.join(lines)+'\n');print(json.dumps({'pages':len(pages),'checks':sum(len(p['checks']) for p in pages),'evidence':len(image_rows),'extras':list(extra),'missing':[p['route'] for p in pages if p['status']!='passed-ui']},ensure_ascii=False))
