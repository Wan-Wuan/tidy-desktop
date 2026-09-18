import React from 'react'
import { AppWindow, FolderPlus, GearSix, MagicWand, Plus, X } from '@phosphor-icons/react'
import { UpdateButton } from './UpdateButton'
import { hasDisplayableIcon } from '../utils/iconUtils'
import type { AppItem, Subcategory } from '../../../shared/types'
import type { UpdateProgress } from '../../../shared/electron'
import type { IconRefreshProgress } from './modals/types'

interface OverviewStats {
  visible: number
  total: number
  folders: number
  missingIcons: number
  hidden: number
}

interface HeaderOverviewProps {
  toolbarIconOnly: boolean
  setShowAddApp: (value: boolean) => void
  handleAddFolder: () => void | Promise<void>
  setShowSmartOrganize: (value: boolean) => void
  setShowSettings: (value: boolean) => void
  updateState: string
  updateVersion: string | undefined
  updateProgress: UpdateProgress | undefined
  currentVersion: string | null
  activeCategoryLabel: string
  overviewHealth: React.ReactNode
  overviewStats: OverviewStats
  displaySubcategories: Subcategory[]
  handleRefreshAllIcons: () => void | Promise<void>
  iconRefreshProgress: IconRefreshProgress | null
  handleRestoreHiddenApps: () => void | Promise<void>
  smartLaunchApps: AppItem[]
  handleOpenApp: (app: AppItem) => void | Promise<void>
}

// 顶部概览区：品牌区 + 工具栏 + 健康度 / 可见数 / 智能启动入口。
// 纯展示 + 回调透传，JSX 与原 App 内联实现逐字一致，行为不变。
export function HeaderOverview({
  toolbarIconOnly,
  setShowAddApp,
  handleAddFolder,
  setShowSmartOrganize,
  setShowSettings,
  updateState,
  updateVersion,
  updateProgress,
  currentVersion,
  activeCategoryLabel,
  overviewHealth,
  overviewStats,
  displaySubcategories,
  handleRefreshAllIcons,
  iconRefreshProgress,
  handleRestoreHiddenApps,
  smartLaunchApps,
  handleOpenApp
}: HeaderOverviewProps) {
  return (
    <header className="app-header glass px-5 py-3 sticky top-0 z-20 rounded-b-2xl">
      <div className="app-header-primary flex items-center justify-between gap-3">
        <div className="app-brand flex shrink-0 items-center gap-3">
          <img
            src="./favicon.svg"
            alt=""
            aria-hidden="true"
            draggable={false}
            className="w-8 h-8 rounded-lg shadow-md shadow-brand-500/20"
          />
          <h1 className="text-lg font-display font-bold text-brand-700 tracking-tight">Tidy Desktop</h1>
        </div>
        <div className="app-header-actions flex min-w-0 items-center justify-end">
          <div className={`header-actions-group ${toolbarIconOnly ? 'header-actions-icon-only' : ''}`}>
            <button
              onClick={() => setShowAddApp(true)}
              aria-label="添加应用"
              title="添加应用"
              className="header-action"
            >
              <Plus size={15} weight="bold" aria-hidden="true" />
              <span className="max-[899px]:hidden">添加应用</span>
            </button>
            <button
              onClick={handleAddFolder}
              aria-label="添加文件夹"
              title="添加文件夹"
              className="header-action"
            >
              <FolderPlus size={15} weight="bold" aria-hidden="true" />
              <span className="max-[899px]:hidden">添加文件夹</span>
            </button>
            <button
              onClick={() => setShowSmartOrganize(true)}
              aria-label="整理中心"
              title="整理中心"
              className="header-action"
            >
              <MagicWand size={15} weight="bold" aria-hidden="true" />
              <span className="max-[899px]:hidden">整理中心</span>
            </button>
            <button
              onClick={() => setShowSettings(true)}
              aria-label="设置"
              title="设置"
              className="header-action"
            >
              <GearSix size={15} weight="bold" aria-hidden="true" />
              <span className="max-[899px]:hidden">设置</span>
            </button>
            <button
              onClick={() => window.electronAPI.hideMainWindow()}
              aria-label="关闭窗口"
              title="关闭窗口"
              className="header-action header-action-close"
            >
              <X size={15} weight="bold" aria-hidden="true" />
            </button>
          </div>
          <UpdateButton state={updateState} version={updateVersion} progress={updateProgress ?? undefined} />
        </div>
      </div>
      <div className="app-overview mt-3 border-t border-brand-100/70 pt-3 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 text-[11px] font-bold text-white shadow-sm shadow-slate-900/20">{currentVersion ? `v${currentVersion.split('.').slice(0, 2).join('.')}` : '✦'}</span>
            <div>
              <h2 className="text-sm font-display font-bold text-slate-900 truncate">{activeCategoryLabel}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600">
                <span className="rounded-full bg-slate-900 px-2 py-0.5 text-white border border-slate-900">{overviewHealth}</span>
                <span className="rounded-full bg-white/80 px-2 py-0.5 border border-slate-200/80">{overviewStats.visible}/{overviewStats.total} 可见</span>
                <span className="rounded-full bg-white/80 px-2 py-0.5 border border-slate-200/80">{displaySubcategories.length} 个子分类</span>
                <span className="rounded-full bg-white/80 px-2 py-0.5 border border-slate-200/80">{overviewStats.folders} 个文件夹</span>
                {overviewStats.missingIcons > 0 && (
                  <button
                    onClick={handleRefreshAllIcons}
                    disabled={!!iconRefreshProgress}
                    className="focus-ring cursor-pointer rounded-full bg-amber-50 px-2 py-0.5 text-amber-700 border border-amber-200 hover:bg-amber-500 hover:text-white hover:border-amber-500 disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
                  >
                    {iconRefreshProgress ? `刷新中 ${iconRefreshProgress.done}/${iconRefreshProgress.total}` : `${overviewStats.missingIcons} 个图标待补全`}
                  </button>
                )}
                {overviewStats.hidden > 0 && (
                  <button
                    onClick={handleRestoreHiddenApps}
                    className="focus-ring cursor-pointer rounded-full bg-slate-100 px-2 py-0.5 text-slate-700 border border-slate-200 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-colors"
                  >
                    恢复 {overviewStats.hidden} 个隐藏项
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          {smartLaunchApps.length > 0 && (
            <div className="hidden min-w-0 items-center gap-2 lg:flex">
              <span className="shrink-0 text-[11px] font-semibold text-slate-500">智能启动</span>
              {smartLaunchApps.map(app => (
                <button
                  key={app.id}
                  onClick={() => handleOpenApp(app)}
                  className="group focus-ring cursor-pointer inline-flex max-w-[132px] items-center gap-1.5 rounded-lg border border-brand-100/80 bg-white/80 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-900 hover:bg-slate-900 hover:text-white"
                  title={app.name}
                >
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded bg-brand-50 group-hover:bg-white/15">
                    {hasDisplayableIcon(app.icon) ? (
                      <img src={app.icon} alt="" className="h-4 w-4" draggable={false} />
                    ) : (
                      app.type === 'folder'
                        ? <FolderPlus size={14} weight="duotone" aria-hidden="true" />
                        : <AppWindow size={14} weight="duotone" aria-hidden="true" />
                    )}
                  </span>
                  <span className="truncate">{app.name}</span>
                </button>
              ))}
            </div>
          )}
          {smartLaunchApps.length === 0 && overviewStats.total > 0 && (
            <div className="hidden text-[11px] font-medium text-slate-500 lg:block">
              打开几次项目后会生成智能启动
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
