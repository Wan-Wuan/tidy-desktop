import ReactDOM from 'react-dom/client'
import App from './App'
import { installAppNotice } from './utils/appNotice'
import { loadRemoteFontsAfterFirstPaint } from './utils/remoteFonts'
import './index.css'

// 接管 window.alert：原生提示是独立系统窗口，会夺走焦点，开着「失焦自动隐藏」时
// 会把主界面一起藏掉。换成窗口内提示（见 utils/appNotice 与 AppNoticeDialog）。
installAppNotice()

// 远程字体放到首帧之后再加载，避免首帧被跨境字体请求阻塞（详见 utils/remoteFonts.ts）。
loadRemoteFontsAfterFirstPaint()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <App />
)
