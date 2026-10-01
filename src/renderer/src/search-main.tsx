import ReactDOM from 'react-dom/client'
import SearchApp from './SearchApp'
import { loadRemoteFontsAfterFirstPaint } from './utils/remoteFonts'
import './search.css'

// 搜索窗唤出频率最高，首帧更不能被远程字体请求挡住（详见 utils/remoteFonts.ts）。
loadRemoteFontsAfterFirstPaint()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <SearchApp />
)
