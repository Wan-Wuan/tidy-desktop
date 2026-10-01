import React, { useEffect, useMemo, useState } from 'react'
import { ArrowsClockwise, Check, MagnifyingGlass } from '@phosphor-icons/react'
import type { AppItem, AppItemDraft, AppItemType, BrowserEntry, Category, NoteKind, OpenWithCommand, TodoItem } from '../../../../shared/types'
import { formatCommandPreview, splitCommandLine } from '../../../../shared/commandLine'
import {
  APP_TYPE_PATH_LABELS,
  APP_TYPE_PLACEHOLDERS,
  APP_TYPE_REQUIRES_PATH
} from '../../utils/appTypes'
import { categoryIconGlyph } from '../../utils/categoryIcon'
import { safePickFile } from '../../utils/nativeDialog'
import { countTodos, createTodoItem, removeTodoItem, toggleTodoItem, updateTodoText } from '../../utils/todo'
import { describeUrlMetaError } from '../../utils/urlMetaError'
import { useUrlMeta } from '../../hooks/useUrlMeta'
import { AppTypeSegmented } from './AppTypeSegmented'
import { AppTypeIcon } from '../AppTypeIcon'

/** 组合成员只允许这几类——与主进程 `launchGroupMember` 的分派保持一致。 */
const GROUP_MEMBER_TYPES: AppItemType[] = ['app', 'folder', 'steam', 'url']

/** 文本项目的两种正文形态 */
const NOTE_KIND_OPTIONS: { value: NoteKind; label: string }[] = [
  { value: 'text', label: '笔记' },
  { value: 'todo', label: '待办' }
]

const inputClass =
  'w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400 text-sm'

/**
 * 项目表单本体：添加弹窗与编辑弹窗共用。
 *
 * 拆出来的理由很直接——6 种类型 × 各自的专属字段 = 一份 200 多行的表单，
 * 两个弹窗各抄一遍，下次加字段必然只改一处（历史上就发生过：
 * 类型选择器两边不一致）。
 */
export const AppDraftForm = React.memo(function AppDraftForm({
  initial,
  categories,
  apps,
  browsers,
  urlMetaEnabled,
  submitLabel,
  excludeAppId,
  onSubmit,
  onCancel
}: {
  initial: AppItemDraft
  categories: Category[]
  apps: AppItem[]
  /** 配置里登记过的浏览器；用来给网址项目挑「打开方式」 */
  browsers: BrowserEntry[]
  urlMetaEnabled: boolean
  submitLabel: string
  /** 编辑时排除自己：组合不能把自己算成成员 */
  excludeAppId?: string
  onSubmit: (draft: AppItemDraft) => void
  onCancel: () => void
}) {
  const [type, setType] = useState<AppItemType>(initial.type)
  const [name, setName] = useState(initial.name)
  const [path, setPath] = useState(initial.path)
  const [categoryId, setCategoryId] = useState(initial.categoryId)
  const [aliasText, setAliasText] = useState((initial.aliases || []).join(', '))
  const [args, setArgs] = useState(initial.args || '')
  const [workingDir, setWorkingDir] = useState(initial.workingDir || '')
  const [noteContent, setNoteContent] = useState(initial.noteContent || '')
  const [noteKind, setNoteKind] = useState<NoteKind>(initial.noteKind === 'todo' ? 'todo' : 'text')
  const [todoItems, setTodoItems] = useState<TodoItem[]>(initial.todoItems || [])
  /* 「用指定程序打开」的三段。命令留空 = 没配（走系统默认方式） */
  const [openWithCommand, setOpenWithCommand] = useState(initial.openWith?.command || '')
  const [openWithBefore, setOpenWithBefore] = useState(initial.openWith?.argsBefore || '')
  const [openWithAfter, setOpenWithAfter] = useState(initial.openWith?.argsAfter || '')
  const [memberIds, setMemberIds] = useState<string[]>(initial.memberIds || [])
  /** 网址项目固定用哪个浏览器打开；空串 = 跟随系统默认 */
  const [browserId, setBrowserId] = useState(initial.browserId || '')
  const [confirmBeforeLaunch, setConfirmBeforeLaunch] = useState(initial.confirmBeforeLaunch === true)
  const [memberQuery, setMemberQuery] = useState('')
  /** 网址抓到的 favicon；提交时随草稿一起带下去，省掉一次「存完再抓」 */
  const [icon, setIcon] = useState(initial.icon || '')
  const { status: metaStatus, title: metaTitle, error: metaError, fetchMeta } = useUrlMeta()

  const parseAliases = (value: string) => value.split(/[,，\s]+/).map(item => item.trim()).filter(Boolean)

  /* 分类列表变化时校正选择（例如弹窗开着的时候某个分类被删掉了）。
     用函数式 updater 读当前值，**绝不把 categoryId 放进依赖数组**——
     一旦放进去，用户每选一个分类都会重新触发本 effect，又把它按"第一个分类"
     改回去，选择器等于点不动。同理只在"当前选择已失效"时才回落，
     不再无条件覆盖用户的挑选。 */
  useEffect(() => {
    setCategoryId(prev => (prev && categories.some(c => c.id === prev) ? prev : categories[0]?.id ?? ''))
  }, [categories])

  /* 同上：选中的浏览器被从设置里删掉后，回落到「默认浏览器」。
     不回落的后果是 <select> 的 value 匹配不到任何 option，界面显示空白，
     用户以为没设过，实际存下去的还是那个已经不存在的 id。 */
  useEffect(() => {
    setBrowserId(prev => (prev && browsers.some(b => b.id === prev) ? prev : ''))
  }, [browsers])

  const candidateMembers = useMemo(() => {
    const query = memberQuery.trim().toLowerCase()
    return apps
      .filter(app => app.id !== excludeAppId)
      .filter(app => GROUP_MEMBER_TYPES.includes(app.type || 'app'))
      .filter(app => !query || app.name.toLowerCase().includes(query))
  }, [apps, excludeAppId, memberQuery])

  /** 已在组合里的成员排在前面，顺序就是启动顺序——用户改顺序时不用去列表里翻。 */
  const orderedMembers = useMemo(
    () => memberIds.map(id => apps.find(app => app.id === id)).filter((app): app is AppItem => Boolean(app)),
    [memberIds, apps]
  )

  const toggleMember = (id: string) => {
    setMemberIds(prev => (prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]))
  }

  const handleFetchMeta = async () => {
    const result = await fetchMeta(path)
    if (!result) return
    // 抓到标题就填上，但**不覆盖用户已经写好的名字**——用户写的就是最终答案
    if (result.title && !name.trim()) setName(result.title)
    if (result.icon) setIcon(result.icon)
  }

  const handleTypeChange = (next: AppItemType) => {
    setType(next)
    /* 换类型时清掉不再适用的残留：
       网址的 favicon 不能跟着变成应用的图标，组合的成员也不能跟着变成文本的正文。 */
    if (next !== 'url') setIcon('')
  }

  /** 编辑器顶部显示进度用；条目可能很多，只关心完成数 */
  const doneCount = countTodos(todoItems).done

  /* 「启动参数 / 起始位置」只对可执行程序生效——主进程侧同样只对 .exe 走 spawn
     （`.bat`/`.cmd` 要 shell，`.lnk`/`.msc` 要 shell 解析）。这里提前告诉用户，
     别让他填完、保存、点开发现没生效，还以为是软件坏了。 */
  const isExePath = /\.exe$/i.test(path.trim())

  /** 「用指定程序打开」最终拼出来的命令行。**仅供界面预览**，实际执行走参数数组 */
  const commandPreview = useMemo(() => {
    const command = openWithCommand.trim()
    if (!command) return ''
    return formatCommandPreview(command, [
      ...splitCommandLine(openWithBefore),
      path.trim() || '⟨项目路径⟩',
      ...splitCommandLine(openWithAfter)
    ])
  }, [openWithCommand, openWithBefore, openWithAfter, path])

  const handlePickCommand = async () => {
    /* 只让选 .exe：主进程侧同样只放行 .exe（见 open-app-with 的注释） */
    const picked = await safePickFile({ extensions: ['exe'], title: '选择程序' })
    if (!picked) return
    setOpenWithCommand(picked)
  }

  const canSubmit = (() => {
    if (!name.trim()) return false
    if (type === 'note') return true
    if (type === 'group') return memberIds.length > 0
    return Boolean(path.trim())
  })()

  /** 只有 app / folder 会带「用指定程序打开」，且命令为空时收敛成 null（走系统默认） */
  const buildOpenWith = (): OpenWithCommand | null => {
    if (type !== 'app' && type !== 'folder') return null
    const command = openWithCommand.trim()
    if (!command) return null
    return { command, argsBefore: openWithBefore, argsAfter: openWithAfter }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    onSubmit({
      name: name.trim(),
      // 文本与组合的 path 一律存空串，别把界面上的说明文字当成路径存下来
      path: APP_TYPE_REQUIRES_PATH[type] ? path.trim() : '',
      categoryId,
      type,
      aliases: parseAliases(aliasText),
      args,
      workingDir,
      browserId: type === 'url' ? (browserId || null) : null,
      openWith: buildOpenWith(),
      noteContent,
      noteKind,
      todoItems,
      memberIds,
      confirmBeforeLaunch,
      icon: type === 'url' ? icon : ''
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="mb-4">
        <label className="block text-sm font-medium text-slate-700 mb-1.5">类型</label>
        <AppTypeSegmented value={type} onChange={handleTypeChange} />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-slate-700 mb-1">名称</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
          placeholder={APP_TYPE_PLACEHOLDERS[type].name}
          required
        />
      </div>

      {type === 'note' ? (
        <>
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">正文形式</label>
            {/* 复用「项目类型」那套分段控件样式：外观一致、同样走主题变量，
                没必要为两个按钮再写一份 CSS。 */}
            <div role="group" aria-label="正文形式" className="app-type-segmented grid grid-cols-2 gap-1">
              {NOTE_KIND_OPTIONS.map(option => {
                const active = option.value === noteKind
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    data-active={active ? 'true' : undefined}
                    onClick={() => setNoteKind(option.value)}
                    className="app-type-segment focus-ring rounded-lg px-2 py-1.5 text-xs font-medium transition-colors"
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          </div>

          {noteKind === 'todo' ? (
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                条目
                {todoItems.length > 0 && (
                  <span className="text-slate-400 font-normal">（{doneCount}/{todoItems.length} 已完成）</span>
                )}
              </label>
              <div className="space-y-2">
                {todoItems.map((item, index) => (
                  <div key={item.id} className="flex items-center gap-2">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={item.done}
                      /* 条目文字可能还是空的（刚加的行），所以可访问名用序号而非内容 */
                      aria-label={`标记第 ${index + 1} 条完成`}
                      onClick={() => setTodoItems(prev => toggleTodoItem(prev, item.id))}
                      className={`focus-ring flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors ${
                        item.done
                          ? 'border-brand-500 bg-brand-500 text-white'
                          : 'border-slate-300 text-transparent hover:border-brand-400'
                      }`}
                    >
                      <Check size={11} weight="bold" aria-hidden="true" />
                    </button>
                    <input
                      type="text"
                      value={item.text}
                      aria-label={`待办条目 ${index + 1}`}
                      placeholder="输入待办事项…"
                      onChange={(e) => {
                        const value = e.target.value
                        setTodoItems(prev => updateTodoText(prev, item.id, value))
                      }}
                      className={inputClass}
                    />
                    <button
                      type="button"
                      onClick={() => setTodoItems(prev => removeTodoItem(prev, item.id))}
                      aria-label={`删除条目 ${index + 1}`}
                      className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-rose-600 transition-colors hover:border-rose-400"
                    >
                      删除
                    </button>
                  </div>
                ))}
                {todoItems.length === 0 && (
                  <p className="text-xs text-slate-400">暂无条目，点击下方按钮添加。</p>
                )}
                <button
                  type="button"
                  onClick={() => setTodoItems(prev => [...prev, createTodoItem('')])}
                  disabled={todoItems.length >= 500}
                  className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
                >
                  + 添加条目
                </button>
              </div>
            </div>
          ) : (
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">正文</label>
              <textarea
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                rows={5}
                className={`${inputClass} resize-y`}
                placeholder="输入笔记内容…保存后点击卡片即可查看与复制"
              />
            </div>
          )}
        </>
      ) : type === 'group' ? (
        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700 mb-1">
            成员 <span className="text-slate-400 font-normal">（按勾选顺序启动，已选 {memberIds.length} 个）</span>
          </label>

          {orderedMembers.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {orderedMembers.map(app => (
                <button
                  key={app.id}
                  type="button"
                  onClick={() => toggleMember(app.id)}
                  title="点击移除"
                  className="group-member-chip focus-ring inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-xs transition-colors"
                >
                  <AppTypeIcon type={app.type || 'app'} size={12} />
                  <span className="truncate max-w-[7rem]">{app.name}</span>
                  <span aria-hidden="true" className="opacity-60">×</span>
                </button>
              ))}
            </div>
          )}

          <div className="relative mb-1.5">
            <MagnifyingGlass size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              type="text"
              value={memberQuery}
              onChange={(e) => setMemberQuery(e.target.value)}
              className={`${inputClass} pl-8`}
              placeholder="搜索项目…"
            />
          </div>

          <div className="group-member-list max-h-40 overflow-y-auto rounded-lg p-1">
            {candidateMembers.length === 0 ? (
              <p className="px-2 py-3 text-xs text-slate-500">暂无可加入的项目</p>
            ) : (
              candidateMembers.map(app => {
                const checked = memberIds.includes(app.id)
                return (
                  <label
                    key={app.id}
                    className="group-member-row flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleMember(app.id)}
                      className="accent-brand-500"
                    />
                    <AppTypeIcon type={app.type || 'app'} size={14} />
                    <span className="truncate text-slate-700">{app.name}</span>
                  </label>
                )
              })
            )}
          </div>

          <p className="mt-1.5 text-[11px] text-slate-500">
            文本与组合不能作为成员：文本没有「打开」动作，组合嵌套组合会无限展开。
          </p>

          <label className="mt-2 flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={confirmBeforeLaunch}
              onChange={(e) => setConfirmBeforeLaunch(e.target.checked)}
              className="accent-brand-500"
            />
            启动前先确认（可临时取消勾选个别成员）
          </label>
        </div>
      ) : (
        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700 mb-1">{APP_TYPE_PATH_LABELS[type]}</label>
          <div className={type === 'url' ? 'flex gap-2' : ''}>
            <input
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              className={inputClass}
              placeholder={APP_TYPE_PLACEHOLDERS[type].path}
              required={APP_TYPE_REQUIRES_PATH[type]}
            />
            {type === 'url' && (
              <button
                type="button"
                onClick={() => void handleFetchMeta()}
                disabled={!path.trim() || !urlMetaEnabled || metaStatus === 'loading'}
                title={urlMetaEnabled ? '抓取网页标题与图标' : '已在设置中关闭「自动获取网址信息」'}
                className="url-fetch-button focus-ring shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50"
              >
                <ArrowsClockwise
                  size={14}
                  className={metaStatus === 'loading' ? 'animate-spin' : undefined}
                  aria-hidden="true"
                />
                {metaStatus === 'loading' ? '抓取中' : '获取信息'}
              </button>
            )}
          </div>
          {type === 'url' && metaStatus !== 'idle' && (
            <p className={`mt-1.5 text-[11px] ${metaStatus === 'error' ? 'text-amber-600' : 'text-emerald-600'}`}>
              {metaStatus === 'loading'
                ? '正在抓取网页标题与图标…'
                : metaStatus === 'done'
                  ? `已获取：${metaTitle || '（页面没有标题）'}${icon ? ' · 已获取图标' : ' · 无图标，将使用域名头像'}`
                  : describeUrlMetaError(metaError)}
            </p>
          )}
          {/* 只在设置里登记过浏览器时才出现：一个都没登记就只剩「默认浏览器」一项，
              摆一个只有单个选项的下拉框纯属噪音。 */}
          {type === 'url' && browsers.length > 0 && (
            <div className="mt-3">
              <label className="block text-xs font-medium text-slate-600 mb-1">打开方式</label>
              <select value={browserId} onChange={(e) => setBrowserId(e.target.value)} className={inputClass}>
                <option value="">系统默认浏览器</option>
                {browsers.map(browser => (
                  <option key={browser.id} value={browser.id}>{browser.name}</option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-slate-500">
                指定后点击卡片即用该浏览器打开；右键菜单中仍可临时改用其它浏览器。
              </p>
            </div>
          )}
        </div>
      )}

      {type === 'app' && (
        <details className="mb-4 rounded-lg border border-slate-200/80 px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">启动参数与起始位置（可选）</summary>
          <div className="mt-3 space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">启动参数</label>
              <input
                type="text"
                value={args}
                onChange={(e) => setArgs(e.target.value)}
                className={inputClass}
                placeholder="--flag value"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">起始位置</label>
              <input
                type="text"
                value={workingDir}
                onChange={(e) => setWorkingDir(e.target.value)}
                className={inputClass}
                placeholder="D:\Projects"
              />
            </div>
            {/* 只有 .exe 能被直接带参数启动（.bat/.cmd 要 shell，.lnk/.msc 要 shell 解析）。
                与其让用户填完才发现没生效，不如在他填的这一刻就说清楚。 */}
            {!isExePath && (
              <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-700">
                当前路径不是 <span className="font-mono">.exe</span>
                （{path.trim() ? '当前填写的是其它类型' : '尚未填写路径'}），这两项
                <span className="font-medium">不会生效</span>
                ——只有可执行程序能被直接带参数启动。
              </p>
            )}
            <p className="text-[11px] text-slate-500">
              参数按 Windows 命令行规则拆分，带空格的片段可以用双引号包起来；
              可以引用设置中「环境变量」表内定义的 <span className="font-mono">%KEY%</span>。
            </p>
          </div>
        </details>
      )}

      {(type === 'app' || type === 'folder') && (
        <details className="mb-4 rounded-lg border border-slate-200/80 px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">
            用指定程序打开（可选）
            {openWithCommand.trim() !== '' && (
              <span className="ml-1.5 text-xs font-normal text-brand-600">已指定</span>
            )}
          </summary>
          <div className="mt-3 space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">程序</label>
              <div className="flex items-center gap-2">
                <span
                  className="min-w-0 flex-1 truncate font-mono text-xs text-slate-500"
                  title={openWithCommand}
                >
                  {openWithCommand || '未指定，将使用系统默认方式打开'}
                </span>
                <button
                  type="button"
                  onClick={handlePickCommand}
                  className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 transition-colors hover:border-brand-400"
                >
                  {openWithCommand ? '更换' : '选择程序'}
                </button>
                {openWithCommand && (
                  <button
                    type="button"
                    onClick={() => setOpenWithCommand('')}
                    className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-500 transition-colors hover:border-slate-400"
                  >
                    清除
                  </button>
                )}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">路径前参数</label>
              <input
                type="text"
                value={openWithBefore}
                onChange={(e) => setOpenWithBefore(e.target.value)}
                className={inputClass}
                placeholder="--goto"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">路径后内容</label>
              <input
                type="text"
                value={openWithAfter}
                onChange={(e) => setOpenWithAfter(e.target.value)}
                className={inputClass}
                placeholder="-nosession"
              />
            </div>
            {commandPreview && (
              <div className="rounded-lg bg-brand-50/50 px-2.5 py-2">
                <div className="text-[11px] text-slate-500">实际执行的命令</div>
                <div className="mt-0.5 break-all font-mono text-[11px] text-slate-700">{commandPreview}</div>
              </div>
            )}
            <p className="text-[11px] text-slate-500">
              路径固定夹在中间：程序 → 路径前参数 → 项目路径 → 路径后内容。
              参数按 Windows 命令行规则拆分，带空格的片段可以用双引号包起来。
              只能选 <span className="font-mono">.exe</span>。
            </p>
          </div>
        </details>
      )}

      <div className="mb-4">
        <label className="block text-sm font-medium text-slate-700 mb-1">分类</label>
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputClass}>
          <option value="">无分类</option>
          {categories.map(cat => (
            <option key={cat.id} value={cat.id}>{categoryIconGlyph(cat.icon)} {cat.name}</option>
          ))}
        </select>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-slate-700 mb-1">搜索别名</label>
        <input
          type="text"
          value={aliasText}
          onChange={(e) => setAliasText(e.target.value)}
          className={inputClass}
          placeholder="ps, vx, work"
        />
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="focus-ring px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
        >
          取消
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className="focus-ring px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors shadow-sm shadow-brand-500/20 disabled:opacity-50"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  )
})
