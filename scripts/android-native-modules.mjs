import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sdkModules = require('@dcloudio/uni-uts-v1/lib/ext-api/modules-vapor.json');

// The offline host needs these even when the app does not call their APIs directly.
export const hostArchives = ['app-common', 'app-runtime', 'breakpad-build', 'uts-runtime', 'ext-component'];
const hostModules = [
  'uni-convert2AbsFullPath', 'uni-crash', 'uni-dialogPage', 'uni-event', 'uni-exit',
  'uni-getAccessibilityInfo', 'uni-getAppAuthorizeSetting', 'uni-getElementById', 'uni-getSystemSetting',
  'uni-openAppAuthorizeSetting', 'uni-prompt', 'uni-pullDownRefresh', 'uni-rpx2px', 'uni-secure-network',
  'uni-storage', 'uni-theme', 'uni-uasm',
];
const moduleArchives = {
  'uni-canvas-dom2': ['uni-canvas-dom2', 'uni-canvas-component'],
  'uni-map': ['uni-map-tencent'],
  'uni-scanCode': ['uni-scanCode', 'uni-barcode-scanning', 'uni-camera'],
  'uni-swiper': ['ext-component'],
};

export function androidModulePlan(service, manifest) {
  // Vapor exposes native component lookups in the compiled JS, after platform preprocessing.
  const apis = new Set([...service.matchAll(/\buni\s*(?:\.\s*([\w$]+)|\[\s*["']([\w$]+)["']\s*\])/g)]
    .map(match => match[1] ?? match[2]));
  const tags = new Set([...service.matchAll(/\bresolveComponent\(\s*["']([\w-]+)["']/g)].map(match => match[1]));
  const declared = manifest['app-android']?.distribute?.modules ?? manifest.app?.distribute?.modules ?? {};
  const required = new Set([...hostModules, ...Object.keys(declared)]);
  for (const [name, module] of Object.entries(sdkModules)) {
    const usesApi = Object.entries(module.uni ?? {}).some(([api, options]) => apis.has(api) && options.app?.kotlin);
    const usesComponent = [...module.components ?? [], ...module.easycom ?? [], ...module.customElements ?? []]
      .some(tag => tags.has(tag));
    if (usesApi || usesComponent) required.add(name);
  }
  return [...new Set([...required].flatMap(name => moduleArchives[name] ?? [name]))].sort();
}
