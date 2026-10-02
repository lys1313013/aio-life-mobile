import categories from './category-icons.json'
import business from './business-icons.json'
import actions from './action-icons.json'

interface LocalIcon {
  body: string;
  width: number;
  height: number;
  left?: number;
  top?: number;
}

export const exerciseIconPresets = business.exercisePresets
const icons: Record<string, LocalIcon> = { ...categories.icons, ...actions.icons, ...business.icons }
export default { icons }
