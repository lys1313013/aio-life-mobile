/** 仅微信小程序会调起原生订阅；成功回调不代表每个模板均获授权。 */
export function subscribeWechatOnce(templateId) {
  return new Promise((resolve, reject) => {
    // #ifdef MP-WEIXIN
    uni.requestSubscribeMessage({
      tmplIds: [templateId],
      success(result) {
        if (result[templateId] === 'accept') resolve(true);
        else reject(new Error(result[templateId] === 'ban' ? '该消息模板暂不可用' : '未获得订阅授权，可再次尝试'));
      },
      fail() {
        reject(new Error('订阅未完成，请检查微信通知设置后重试'));
      },
    });
    // #endif
    // #ifndef MP-WEIXIN
    reject(new Error('请在微信小程序内订阅'));
    // #endif
  });
}
