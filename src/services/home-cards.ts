import { reactive, watch } from 'vue'
import { request } from './api.ts'
import { session } from './session.ts'
import { createHomeCardPreferences, homeCardState } from './home-card-preferences.ts'

export const homeCardPreferences = reactive(homeCardState())
export const homeCards = createHomeCardPreferences(homeCardPreferences,
  (path, method, body) => request(path, method, body), () => session.token)
watch(() => session.token, () => homeCards.clear(), { flush: 'sync' })
