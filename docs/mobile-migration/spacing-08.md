# 08 设备、衣柜、会员间距验收

H5 模拟接口点击验收通过：10 个场景，72 张原始截图。模拟登录后点击原生底栏“生活”，再点击设备/衣柜/会员入口；无真实账号、凭据或用户数据。

| 页面 | 390 light | 390 dark | 768 light | 1440 light |
| --- | --- | --- | --- | --- |
| goods/devices | 通过 | 通过 | 通过 | 通过 |
| goods/wardrobe | 通过 | 通过 | 通过 | 未在本组范围 |
| member/index | 通过 | 通过 | 通过 | 未在本组范围 |

每场景真实打开新增、编辑、删除确认并取消；新增/编辑长表单滚动到底部。衣柜额外进入分类页，打开新增分类、编辑分类和删除分类取消。设备、会员没有独立只读详情弹窗，其编辑弹窗读取并呈现详情；衣柜点击编辑会先读取 itemDetail。

## 几何与视觉

- 页面由 MobilePage 单层提供页面 padding，390/768 外缘均为 12px；1440 居中内容外框 960px，业务内容从 x=252px 开始（框内 12px）。
- 三页卡片内边距 12px、内部 gap 8px；设备/会员卡片 margin-bottom 为12px；衣柜 grid gap 为12px，不另加卡片 margin。
- 会员双列筛选宽度手机 179/179px，平板368/368px，列间8px。搜索与新增按钮底边视觉对齐。
- 衣柜手机双列卡宽177px，平板三列约239.984px；width 通过 section token 计算并使用 border-box，整行不会因 padding 超宽。
- 主页面可见按钮最小宽/高均44px。所有截图无横向溢出，无pageerror。
- 已使用 view_image 检视原始衣柜手机图及9张 review 合览，覆盖全部72张原始截图，检查卡片内外缘、多行内容密度、按钮对齐、深浅主题、长表单顶部与底部和就近确认气泡。合览中的平板/桌面缩图用于总体布局判断，精确边距以各 JSON DOM 测量为准。

修正衣柜卡片原有 ui-gap-sm 与子元素 ui-mb-sm 重复叠加；卡片宽度固定差值改为共享 token 计算；分类行基础 padding 引用 card token。分类树每层16px缩进是层级几何约束，已有用途注释。

证据：`artifacts/spacing-audit/08/`，每场景JSON含 geometry/evidence/errors，PNG包括页面、编辑顶部/底部和删除确认。`review-*.png` 为人工视觉复核合览。

测试：`npx playwright test tests/e2e/spacing-08.spec.js --output artifacts/spacing-audit/08/playwright --workers=1`。测试使用当前生活菜单树契约，不能沿用历史 spec 的 menus:[]（会显示“暂无可用功能”）。

本组只验证现有5180服务的H5模拟接口；未重启服务、安装、提交，未验证真实后端、微信编译/模拟器/真机或App真机。
