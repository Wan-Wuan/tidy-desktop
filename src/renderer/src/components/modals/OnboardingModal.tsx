import React, { useState } from 'react'

export const OnboardingModal = React.memo(function OnboardingModal({
  onClose,
  onImportShortcuts
}: {
  onClose: () => void
  onImportShortcuts: () => Promise<void>
}) {
  const [importing, setImporting] = useState(false)

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 modal-backdrop">
      <div className="glass rounded-2xl p-6 w-[520px] max-w-[calc(100vw-32px)] shadow-xl shadow-brand-500/10 modal-enter">
        <div className="w-12 h-12 rounded-2xl bg-brand-500 text-white flex items-center justify-center mb-4 shadow-lg shadow-brand-500/25">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" />
          </svg>
        </div>
        <h2 className="text-xl font-display font-bold text-slate-800 mb-2">欢迎使用 Tidy Desktop</h2>
        <p className="text-sm text-slate-500 mb-5">只需要几个步骤，就能把桌面、开始菜单、常用文件夹整理成一个稳定的启动中心。</p>
        <div className="grid grid-cols-2 gap-3 mb-5">
          {[
            ['添加项目', '拖入应用、文件夹、图片或快捷方式。'],
            ['整理分类', '按工作、工具、游戏或资料分组。'],
            ['快速搜索', '用 Ctrl+K 打开搜索框，输入名称或别名。'],
            ['备份维护', '定期导出备份，刷新图标和清理失效项。']
          ].map(([title, text]) => (
            <div key={title} className="p-3 rounded-xl bg-brand-50/50 border border-brand-100/50">
              <div className="text-sm font-semibold text-slate-700">{title}</div>
              <div className="text-xs text-slate-500 mt-1">{text}</div>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors">
            稍后再说
          </button>
          <button
            disabled={importing}
            onClick={async () => {
              setImporting(true)
              try {
                await onImportShortcuts()
              } finally {
                setImporting(false)
              }
            }}
            className="px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors disabled:opacity-60"
          >
            {importing ? '正在扫描...' : '扫描并导入快捷方式'}
          </button>
        </div>
      </div>
    </div>
  )
})
