function homeCardFixture() {
  return [
    ['overview.leetcode','每日一题','lucide:code'], ['overview.github','GitHub','mdi:github'],
    ['overview.exercise','今日运动','mdi:run'], ['overview.shanbay','扇贝单词','lucide:leaf'], ['overview.read','今日阅读','lucide:book-open'],
    ['section.time','时迹','lucide:clock'], ['section.links','快捷导航','lucide:layout-grid'], ['section.watched','待办','lucide:list-checks'],
    ['section.thoughts','闪念','lucide:lightbulb'], ['section.goal','目标','lucide:crosshair'], ['section.anniversary','纪念日','mdi:calendar-heart'],
    ['section.reading','阅读','lucide:book-open'], ['section.membership','会员','lucide:crown'], ['section.movie','观影','lucide:clapperboard'],
    ['section.exercise','运动','mdi:run'], ['section.github','GitHub 最近提交','mdi:github'],
  ].map(([cardKey,title,icon],sortOrder) => ({ cardKey,title,icon,sortOrder,group:cardKey.split('.')[0],enabled:true }));
}
module.exports = { homeCardFixture };
