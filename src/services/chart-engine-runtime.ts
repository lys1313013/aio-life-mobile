// Only the Cartesian charts used by AIO Life; no maps, HTML tooltip or SVG renderer.
import { init, use } from 'echarts/core'
import { LineChart, BarChart } from 'echarts/charts'
import { GridComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

use([LineChart, BarChart, GridComponent, CanvasRenderer])
export { init }
