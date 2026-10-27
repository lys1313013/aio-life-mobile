import { request } from './api.ts'

export type LegalPolicies = {
  version: string; effectiveDate: string; operator: string; contactEmail: string;
  privacy: string[][]; terms: string[][];
}
export async function fetchLegalPolicies(): Promise<LegalPolicies> {
  const data = await request<LegalPolicies>('/auth/legal', 'GET', null, false)
  if (!data || typeof data.version !== 'string' || !data.version ||
      !Array.isArray(data.privacy) || !Array.isArray(data.terms) ||
      [...data.privacy, ...data.terms].some(item => !Array.isArray(item) || item.length !== 2 || item.some(value => typeof value !== 'string')))
    throw new Error('协议加载失败，请重试')
  return data
}
export function registrationConsent(agreed: boolean, version: string) {
  if (!agreed || !version) throw new Error('请阅读并同意隐私政策和服务条款')
  return { agreedPolicy: true, policyVersion: version }
}
export function openLegalPolicy(kind = 'privacy') {
  uni.navigateTo({ url: '/pages/auth/policy?kind=' + (kind === 'terms' ? 'terms' : 'privacy') })
}
