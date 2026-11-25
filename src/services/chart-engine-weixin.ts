import { init, setPlatformAPI, use } from 'echarts/core'
import { LineChart, BarChart, PieChart } from 'echarts/charts'
import { LabelLayout } from 'echarts/features'
import { GridComponent } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'

let context: any
export function chartTextContext() {
  if (!context) context = wx.createOffscreenCanvas({ type: '2d', width: 1, height: 1 }).getContext('2d')
  return context
}

setPlatformAPI({
  measureText(text, font) {
    const ctx = chartTextContext()
    ctx.font = font
    return ctx.measureText(text)
  },
})
use([LineChart, BarChart, PieChart, GridComponent, SVGRenderer, LabelLayout])
export { init }
