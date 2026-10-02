import catalog from './catalog.generated.json'

interface LocalIcon {
  body: string;
  width: number;
  height: number;
  left?: number;
  top?: number;
}

export const exerciseIconPresets = catalog.exercisePresets
const icons: Record<string, LocalIcon> = catalog.icons
export default { icons }
