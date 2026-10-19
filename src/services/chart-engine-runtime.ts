// Only the charts used by AIO Life; no maps, HTML tooltip or SVG renderer.
import { init, use } from 'echarts/core'
import { LineChart, BarChart, PieChart } from 'echarts/charts'
import { LabelLayout } from 'echarts/features'
import { GridComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

use([LineChart, BarChart, PieChart, GridComponent, CanvasRenderer, LabelLayout])
export { init }
