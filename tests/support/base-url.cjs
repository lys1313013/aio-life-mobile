// 浏览器测试和预览服务共用同一地址；独立诊断脚本也支持 E2E_BASE_URL。
const baseURL = new URL(process.env.E2E_BASE_URL || 'http://127.0.0.1:5180').origin;
module.exports = { baseURL };
