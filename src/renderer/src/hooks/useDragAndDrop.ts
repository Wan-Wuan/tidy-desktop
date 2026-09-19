import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppItem } from '../../../shared/types'
import { findDropTarget, isPastCardMidpoint, isPointerOutsideWindow } from '../utils/dropTarget'
import { canNativeDrag } from '../utils/fileKind'

/**
 * 拖拽引擎：左键自绘拖拽 + 外部文件拖入的守卫。
 *
 * 为什么不用 HTML5 draggable 做内部拖拽：dragover 受浏览器节流，幽灵卡片跟手度明显
 * 不如 elementFromPoint 每帧定位。所以内部拖拽统一走这一套（卡片上的 draggable 已移除）；
 * 子分类 chip 的排序仍用 HTML5（它们小而轻，节流不构成问题），相关 state 由本 hook
 * 一并持有并暴露 setter。
 *
 * 从 App.tsx 整体搬迁而来（拆分第 6 步），所有不变量原样保留：
 * - `clearDragState()` 必须在任何 `await` **之前**调用（跨分组拖动会重建源卡片 DOM、
 *   丢失 dragend，事后再清就迟了）；
 * - 落点判定（elementFromPoint 强制同步布局）收敛到 rAF，每帧最多一次；
 * - mousemove 里的目标判定带 ref 守卫 + 左右半边 sideKey，同一目标内不重复 setState；
 * - 左键松手后浏览器会补发 click，用 suppressNextCardClickRef 抑制（消费方是
   App 层的 handleCardClick）；
 * - 待拖拽登记带 3px 位移阈值；
 * - 30 秒看门狗兜底「拖到窗口外松手收不到 mouseup」；
 * - 拖出窗口的文件手势切换成系统原生拖拽（发送/上传），切换前先收干净内部状态。
 *
 * 幽灵卡片（useDragGhost 的产物）以参数注入：本 hook 只负责手势与落点，
 * 不关心幽灵长什么样。重排/归类动作同样以 actions 注入——监听只挂一次，
 * 动作实现每次渲染刷新进 ref 转发，避免闭包过期（见 leftDragActionsRef）。
 */

/** 松手后要执行的动作。实现方（App 层）持有数据与持久化逻辑 */
export interface DragAndDropActions {
  reorder: (sourceId: string, targetId: string, insertAfter?: boolean) => Promise<void>
  toCategory: (appId: string, categoryId: string) => Promise<void>
  toSubcategory: (appId: string, subcategoryId: string | null) => Promise<void>
}

interface UseDragAndDropParams {
  ghost: {
    createDragGhost: (appId: string, x: number, y: number) => void
    moveDragGhost: (x: number, y: number) => void
    removeDragGhost: () => void
  }
  actions: DragAndDropActions
}

export function useDragAndDrop({ ghost, actions }: UseDragAndDropParams) {
  const { createDragGhost, moveDragGhost, removeDragGhost } = ghost

  const [draggedAppId, setDraggedAppId] = useState<string | null>(null)
  const [dragOverCategory, setDragOverCategory] = useState<string | null>(null)
  const [dragOverAppId, setDragOverAppId] = useState<string | null>(null)
  const [draggedSubId, setDraggedSubId] = useState<string | null>(null)
  const [dragOverSubId, setDragOverSubId] = useState<string | null>(null)
  /** 拖应用悬停在网格里的子分类分组上时的目标分组（'__none__' 表示未归类分组） */
  const [dragOverGroupSubId, setDragOverGroupSubId] = useState<string | null>(null)
  /* 拖应用悬停在某张卡片上时，落点在该卡片的哪一半：false/null = 插到它前面，
     true = 插到它后面。既是松手时的依据，也用来画那条插入位置指示线——
     没有这条线，用户看到的是"拖到卡片右边，卡片却落到左边"，只能归因成"不准"。 */
  const [dropInsertAfter, setDropInsertAfter] = useState<boolean | null>(null)

  const draggedAppIdRef = useRef<string | null>(null)
  const isExternalDragRef = useRef(false)
  const dragCounterRef = useRef(0)
  /* 正在被拖拽的卡片如果是文件（图片/文档），这里记下它的路径。
     用途：同一个左键拖拽要同时支持「归类」和「发送」两种意图，靠落点区分——
     拖拽全程在窗口内 = 归类；拖出窗口 = 切换成系统原生拖拽（发送/上传到微信、
     浏览器等外部应用）。 */
  const pendingFileDragRef = useRef<string | null>(null)
  const leftDragRef = useRef<{ appId: string; active: boolean; startX: number; startY: number } | null>(null)
  /** 当前悬停的放置目标（'type:id'），用于避免 mousemove 里重复 setState */
  const leftDragTargetRef = useRef<string | null>(null)
  /** 拖拽看门狗：mouseup 与 mouseleave 双双丢失时兜底收尾，避免预览贴图永久残留 */
  const dragWatchdogRef = useRef<number | null>(null)
  /* dragover 每秒触发几十次，若每次都 setState 会让整个网格反复重渲染并卡死。
     用 ref 记住当前目标，只有真正切换到另一个分组时才更新 state。 */
  const dragOverGroupRef = useRef<string | null>(null)
  /* 与 dragOverGroupRef 同样的 ref 守卫，给 dragOverAppId 用：
     mousemove 高频触发，同一目标卡片内移动不必反复 setState。 */
  const dragOverAppRef = useRef<string | null>(null)
  /* 刚拖拽完置位、下一次卡片 click 消费：左键松手后浏览器**一定**补发 click，
     不拦住的话"拖完排序"就会顺手把应用打开。 */
  const suppressNextCardClickRef = useRef(false)

  /* 只挂一次的 mousemove/mouseup 监听如果直接调用 actions，拿到的是首渲染的闭包
     ——reorder 内部要读 config.ui.sortMode，而首渲染时 config 还是 null，
     于是永远走 'manual' 分支。这里用 ref 转发最新实现。 */
  const leftDragActionsRef = useRef<DragAndDropActions | null>(null)
  useEffect(() => {
    leftDragActionsRef.current = actions
  })

  /* 统一的拖拽收尾。
     ⚠️ 跨子分类拖动会让应用换到别的分组，源卡片的 DOM 被 React 移动/重建，
     于是 dragend 丢失——所有"靠 dragend 清理"的逻辑都会失效，预览贴图会永久
     留在屏幕上。所以 drop 处理里必须主动调它，而且要在任何 await 之前调，
     不能把清理挂在异步操作后面。 */
  const clearDragState = useCallback(() => {
    if (dragWatchdogRef.current) {
      window.clearTimeout(dragWatchdogRef.current)
      dragWatchdogRef.current = null
    }
    removeDragGhost()
    draggedAppIdRef.current = null
    dragOverGroupRef.current = null
    dragOverAppRef.current = null
    leftDragTargetRef.current = null
    setDraggedAppId(null)
    setDraggedSubId(null)
    setDragOverAppId(null)
    setDragOverCategory(null)
    setDragOverSubId(null)
    setDragOverGroupSubId(null)
    setDropInsertAfter(null)
  }, [removeDragGhost])

  /* HTML5 拖拽的全局兜底：指针彻底离开窗口（relatedTarget 为 null）时复位
     外部拖入计数；dragend 兜底防"源节点被移除导致收不到事件、拖拽态卡死"。 */
  useEffect(() => {
    const resetExternalDrag = (e: DragEvent) => {
      if (e.relatedTarget === null) {
        dragCounterRef.current = 0
        isExternalDragRef.current = false
      }
    }
    const handleGlobalDragEnd = () => {
      dragCounterRef.current = 0
      isExternalDragRef.current = false
      // 全局兜底：把所有拖拽态（含预览贴图）一次性收干净
      clearDragState()
    }
    document.addEventListener('dragleave', resetExternalDrag)
    document.addEventListener('dragend', handleGlobalDragEnd)
    return () => {
      document.removeEventListener('dragleave', resetExternalDrag)
      document.removeEventListener('dragend', handleGlobalDragEnd)
    }
  }, [clearDragState])

  useEffect(() => {
    return () => {
      // 看门狗是个 30 秒的长定时器，卸载时必须清掉，
      // 否则它会在组件销毁后触发 clearDragState（对已卸载组件 setState）
      if (dragWatchdogRef.current) {
        window.clearTimeout(dragWatchdogRef.current)
        dragWatchdogRef.current = null
      }
    }
  }, [])

  /* ── 左键自绘拖拽引擎 ── */
  useEffect(() => {
    /* switchToNativeDrag 用于「拖出窗口」时发送/上传到微信、浏览器等外部应用。
       ⚠️ 顺序不能变：必须先把内部拖拽状态收干净再启动原生拖拽。
       原生拖拽会接管鼠标，之后我们的 mouseup 收不到，残留的幽灵贴图和落点高亮
       就再也清不掉了。 */
    const switchToNativeDrag = (filePath: string) => {
      leftDragRef.current = null
      pendingFileDragRef.current = null
      /* 抑制点击。注意：原生拖拽被系统接管后通常**不会**补发 click，
         所以这个标志可能没人来消费——留个 500ms 自愈定时器把它清掉，
         否则它会一直悬着，把之后第一次正常点击吃掉（表现为"点了没反应"）。 */
      suppressNextCardClickRef.current = true
      window.setTimeout(() => { suppressNextCardClickRef.current = false }, 500)
      document.body.style.cursor = ''
      clearDragState()
      window.electronAPI.startDragFile(filePath)
    }

    /* 落点判定（elementFromPoint）会强制同步的样式重算 + 布局，代价很高。
       mousemove 在高回报率鼠标下每秒能来几百次，每来一次就强制一次布局——
       这是拖拽时最主要的 CPU 尖峰来源（快速拖动时尤其明显）。
       这里把判定收敛到「每帧最多一次」：中间那些坐标没有意义，只保留最后一次。 */
    let dropTargetRaf = 0
    let dropTargetX = 0
    let dropTargetY = 0

    const applyDropTargetAt = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y)
      const rawTarget = findDropTarget(el)
      const draggedId = leftDragRef.current?.appId
      const target = rawTarget && rawTarget.type === 'app' && rawTarget.id === draggedId
        ? null
        : rawTarget
      /* 落点在卡片哪一半 = 松手后插到它前面还是后面。这里现算，
         并把结果一并作为"目标"的一部分：同一张卡片内左右来回移动时，
         指示线与松手结果都要跟着变，不能因为卡片没换就跳过更新。 */
      const insertAfter = target?.type === 'app' ? isPastCardMidpoint(el, x) : null
      /* 目标没变就一个 setState 都别发，否则整个网格会被反复重渲染到卡死。 */
      const sideKey = insertAfter === null ? '' : insertAfter ? ':after' : ':before'
      const targetKey = target ? `${target.type}:${target.id}${sideKey}` : null
      if (leftDragTargetRef.current === targetKey) return
      leftDragTargetRef.current = targetKey

      if (!target) {
        setDragOverAppId(null)
        setDropInsertAfter(null)
        setDragOverCategory(null)
        setDragOverSubId(null)
        setDragOverGroupSubId(null)
        return
      }
      if (target.type === 'app') {
        setDragOverAppId(target.id)
        setDropInsertAfter(insertAfter)
        setDragOverCategory(null)
        setDragOverSubId(null)
        setDragOverGroupSubId(null)
      } else if (target.type === 'category') {
        setDragOverCategory(target.id)
        setDragOverAppId(null)
        // 非卡片目标没有"前后"之分，必须清掉指示线，否则从卡片移开后线还留着
        setDropInsertAfter(null)
        setDragOverSubId(null)
        setDragOverGroupSubId(null)
      } else if (target.type === 'subcategory') {
        setDragOverSubId(target.id)
        setDragOverAppId(null)
        setDragOverCategory(null)
        setDropInsertAfter(null)
        setDragOverGroupSubId(null)
      } else if (target.type === 'subcategory-drop') {
        setDragOverGroupSubId(target.id)
        dragOverGroupRef.current = target.id
        setDragOverAppId(null)
        setDragOverCategory(null)
        setDragOverSubId(null)
        setDropInsertAfter(null)
      }
    }

    const scheduleDropTargetUpdate = (x: number, y: number) => {
      dropTargetX = x
      dropTargetY = y
      if (dropTargetRaf) return
      dropTargetRaf = requestAnimationFrame(() => {
        dropTargetRaf = 0
        // 排进帧里执行时拖拽可能已经结束（快速甩动后立刻松手），此时不该再改高亮
        if (!leftDragRef.current?.active) return
        applyDropTargetAt(dropTargetX, dropTargetY)
      })
    }

    /* ── 拖拽帧率自检（仅开发环境；打包后渲染层走 file: 协议，自动关闭）──
       拖拽结束会在 DevTools Console 打一行 [drag-perf] 汇总：
       frames=总帧数 avg=平均帧间隔 worst=最差一帧 long>20ms=掉帧数。
       卡顿消失的判据：long 是 0 或个位数，avg 接近 16.7ms。 */
    const dragPerfOn = window.location.protocol !== 'file:'
    let perfFrames = 0
    let perfWorst = 0
    let perfLong = 0
    let perfLast = 0
    let perfStart = 0
    let perfRaf = 0
    const startDragPerf = () => {
      if (!dragPerfOn) return
      if (perfRaf) cancelAnimationFrame(perfRaf)
      perfFrames = 0
      perfWorst = 0
      perfLong = 0
      perfLast = performance.now()
      perfStart = perfLast
      const tick = (now: number) => {
        if (!leftDragRef.current?.active) {
          const total = now - perfStart
          const avg = perfFrames > 0 ? total / perfFrames : 0
          console.log(`[drag-perf] frames=${perfFrames} avg=${avg.toFixed(1)}ms worst=${perfWorst.toFixed(1)}ms long>20ms=${perfLong}`)
          perfRaf = 0
          return
        }
        const delta = now - perfLast
        perfLast = now
        perfFrames++
        if (delta > perfWorst) perfWorst = delta
        if (delta > 20) perfLong++
        perfRaf = requestAnimationFrame(tick)
      }
      perfRaf = requestAnimationFrame(tick)
    }

    const handleLeftDragMove = (e: MouseEvent) => {
      if (!leftDragRef.current) return
      if (!leftDragRef.current.active) {
        const dx = e.clientX - leftDragRef.current.startX
        const dy = e.clientY - leftDragRef.current.startY
        if (Math.abs(dx) + Math.abs(dy) < 3) return
        leftDragRef.current.active = true
        setDraggedAppId(leftDragRef.current.appId)
        draggedAppIdRef.current = leftDragRef.current.appId
        document.body.style.cursor = 'grabbing'
        createDragGhost(leftDragRef.current.appId, e.clientX, e.clientY)
        startDragPerf()
        /* 看门狗：拖到窗口外松手时 mouseup 可能收不到，拖拽状态就会永久卡住
           （表现为排序整个失灵、幽灵贴图留在屏幕上）。到点强制收尾。
           这是从原 HTML5 拖拽实现里迁移过来的保障，不能丢。 */
        if (dragWatchdogRef.current) window.clearTimeout(dragWatchdogRef.current)
        dragWatchdogRef.current = window.setTimeout(() => {
          dragWatchdogRef.current = null
          leftDragRef.current = null
          clearDragState()
        }, 30000)
      }
      /* 文件卡片被拖出窗口 → 这次手势的意图是"发送/上传"而不是"归类"。
         用落点意图区分两种功能，同一个左键手势就能同时覆盖它们，不需要用修饰键或另一个按钮。
         拖拽全程留在窗口内时不会走到这里，所以归类照常工作。 */
      const pendingFile = pendingFileDragRef.current
      if (pendingFile && isPointerOutsideWindow(e)) {
        switchToNativeDrag(pendingFile)
        return
      }
      moveDragGhost(e.clientX, e.clientY)
      // 落点判定收敛到帧内执行，不再每次 mousemove 都强制一次布局
      scheduleDropTargetUpdate(e.clientX, e.clientY)
    }

    const handleLeftDragUp = async (e: MouseEvent) => {
      document.body.style.cursor = ''
      removeDragGhost()
      if (!leftDragRef.current) return
      const { appId, active } = leftDragRef.current
      leftDragRef.current = null
      // 无论是否真的拖动过，这次手势结束都要清掉"待发送文件"的登记
      pendingFileDragRef.current = null
      if (!active) return
      /* 拖拽已经发生，这次按理不会打开应用。
         但左键松手后浏览器仍会补发一次 click，而卡片上挂着 onClick →
         不拦住的话"拖完排序"就会顺手把应用打开。这里置位，由 handleCardClick 消费。 */
      suppressNextCardClickRef.current = true
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const target = findDropTarget(el)
      /* 用**松手位置**现算插到目标前还是后，与拖拽过程中画的指示线同一套判断，
         所以"线画在哪、松手就落在哪"。刻意不读拖拽中的 state：最后一帧之后
         指针可能又移动了一小段，读旧值就会差一位。 */
      const insertAfter = target?.type === 'app' ? isPastCardMidpoint(el, e.clientX) : false
      // 先收尾再执行移动：下面的操作会 setApps 换分组、移动源卡片 DOM，
      // 事后再清容易漏（之前就漏了 dragOverAppRef / groupInsertPlanRef）
      clearDragState()
      const actionsRef = leftDragActionsRef.current
      if (target && actionsRef) {
        if (target.type === 'app' && target.id !== appId) {
          await actionsRef.reorder(appId, target.id, insertAfter)
        } else if (target.type === 'category') {
          await actionsRef.toCategory(appId, target.id)
        } else if (target.type === 'subcategory') {
          await actionsRef.toSubcategory(appId, target.id)
        } else if (target.type === 'subcategory-drop') {
          await actionsRef.toSubcategory(appId, target.id === '__none__' ? null : target.id)
        }
      }
    }

    /* 兜底：指针移出窗口时 mousemove 可能不再派发，光靠坐标判断会漏掉最后一段。
       documentElement 的 mouseleave 是"指针离开窗口"最可靠的信号。 */
    const handlePointerLeavesWindow = () => {
      const pendingFile = pendingFileDragRef.current
      if (!pendingFile) return
      if (!leftDragRef.current?.active) return
      switchToNativeDrag(pendingFile)
    }

    document.addEventListener('mousemove', handleLeftDragMove)
    document.addEventListener('mouseup', handleLeftDragUp)
    document.documentElement.addEventListener('mouseleave', handlePointerLeavesWindow)
    return () => {
      document.removeEventListener('mousemove', handleLeftDragMove)
      document.removeEventListener('mouseup', handleLeftDragUp)
      document.documentElement.removeEventListener('mouseleave', handlePointerLeavesWindow)
      // 待执行的落点判定要撤销，否则卸载后 rAF 仍会跑一次
      if (dropTargetRaf) {
        cancelAnimationFrame(dropTargetRaf)
        dropTargetRaf = 0
      }
      if (perfRaf) {
        cancelAnimationFrame(perfRaf)
        perfRaf = 0
      }
      removeDragGhost()
    }
    /* 这四个都来自 useDragGhost / clearDragState，标识稳定（内部是 useCallback + ref），
       加进依赖不会让监听反复解绑重绑。监听里需要"最新实现"的部分（重排、归类）
       统一走 leftDragActionsRef 转发，见上面的说明。 */
  }, [clearDragState, createDragGhost, moveDragGhost, removeDragGhost])

  /* 卡片的 mousedown：登记一次"待拖拽"。
     只有左键参与拖拽；所有卡片类型都进同一套引擎——文件（图片/文档）同样要能
     拖到分类/子分类上归类，发送意图改由「拖出窗口」触发（switchToNativeDrag）。 */
  const handleCardMouseDown = useCallback((e: React.MouseEvent, app: AppItem) => {
    // 只有左键参与拖拽。右键不承担拖拽职责，只负责弹出上下文菜单。
    if (e.button !== 0) return
    // preventDefault 压掉浏览器默认行为：不压的话拖动会变成选中卡片文字或拖动图片。
    e.preventDefault()
    leftDragRef.current = { appId: app.id, active: false, startX: e.clientX, startY: e.clientY }
    // 文件额外记下路径：一旦拖出窗口就切换成系统原生拖拽
    pendingFileDragRef.current = canNativeDrag(app) ? app.path : null
  }, [])

  /* ── 外部文件拖入（资源管理器 → 窗口）的计数与守卫 ──
     dragenter/dragleave 在子元素间进出时会成对触发，用计数器而不是布尔判断
     "是否真的离开了窗口"。onDrop 的实际导入逻辑留在 App 层（它依赖太多
     数据层函数），这里只提供进出的判定。 */
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (draggedAppIdRef.current) return
    if (e.dataTransfer.types.includes('Files') || e.dataTransfer.types.includes('text/uri-list')) {
      isExternalDragRef.current = true
      dragCounterRef.current++
    }
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (draggedAppIdRef.current) return
    dragCounterRef.current--
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0
      isExternalDragRef.current = false
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // 更新自定义幽灵位置
    moveDragGhost(e.clientX, e.clientY)
    if (isExternalDragRef.current) {
      e.dataTransfer.dropEffect = 'copy'
    }
  }, [moveDragGhost])

  const handleDragEnd = useCallback(() => {
    removeDragGhost()
    dragCounterRef.current = 0
    isExternalDragRef.current = false
    setDraggedAppId(null)
    setDragOverCategory(null)
    setDragOverAppId(null)
  }, [removeDragGhost])

  /* 外部拖入的标志由本 hook 私有持有，但真正落地的 onDrop 在 App 层（导入逻辑依赖
     太多数据层函数）。落地第一件事就是复位这两个标志，否则下一次外部拖入会因为
     计数没归零而判成"已经离开窗口"。 */
  const resetExternalDrag = useCallback(() => {
    dragCounterRef.current = 0
    isExternalDragRef.current = false
  }, [])

  return {
    // 拖拽中的高亮目标（渲染用）
    draggedAppId,
    dragOverCategory,
    setDragOverCategory,
    dragOverAppId,
    dragOverSubId,
    dragOverGroupSubId,
    dropInsertAfter,
    // 子分类 chip 的 HTML5 排序仍由 App 层的 JSX 直接驱动
    draggedSubId,
    setDraggedSubId,
    setDragOverSubId,
    // App 层要消费的 ref
    suppressNextCardClickRef,
    draggedAppIdRef,
    // 收尾与事件处理器
    clearDragState,
    resetExternalDrag,
    handleCardMouseDown,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDragEnd
  }
}
