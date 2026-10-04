import { reactive, watch } from 'vue'
import { request } from './api.ts'
import { session } from './session.ts'
import { createHomeCardPreferences, homeCardState } from './home-card-preferences.ts'

export const homeCardPreferences = reactive(homeCardState())
export const homeCards = createHomeCardPreferences(homeCardPreferences,
  (path, method, body) => request(path, method, body), () => session.token)
watch(() => session.token, () => homeCards.clear(), { flush: 'sync' })

// Server-provided icons used by the settings screen; scanned by icons:sync.
export const homeCardIconNames = ['lucide:code', 'mdi:github', 'mdi:run', 'lucide:leaf', 'lucide:book-open', 'lucide:clock', 'lucide:layout-grid', 'lucide:list-checks', 'lucide:lightbulb', 'lucide:crosshair', 'mdi:calendar-heart', 'lucide:crown', 'lucide:clapperboard']
