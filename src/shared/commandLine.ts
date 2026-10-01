/**
 * Windows 命令行拆分。
 *
 * 主进程与渲染层共用：主进程把用户填的参数串拆成数组交给 `spawn`
 * （**绝不交给 shell**，见 `appHandlers` 的 `launchDetached`），
 * 渲染层用它拼出「最终命令预览」。
 *
 * ⚠️ 刻意不依赖 `node:path` 或任何 Node 内置模块——渲染层（Vite）拿不到。
 *
 * 规则（按 Windows 的 CommandLineToArgvW 惯例，只实现真正会用到的部分）：
 *   · 空白分隔参数；
 *   · 双引号包裹的内容保留空格（`"C:\Program Files\a b"` 是一个参数）；
 *   · `\"` 表示一个字面双引号；
 *   · **单引号不是特殊字符**（这是 Windows 与 POSIX 最容易被搞混的一点，
 *     把 `'a b'` 当成一个参数会让 `cmd /c 'echo x'` 这类写法静默变形）；
 *   · 连续空白不产生空参数，但显式的 `""` 会产生一个空参数；
 *   · 引号未闭合时按「一直到结尾都在引用内」处理，不报错。
 */
export function splitCommandLine(input: string): string[] {
  const out: string[] = []
  let current = ''
  /** 当前是否攒过内容——用来区分「空参数」与「压根没这个参数」 */
  let hasToken = false
  let inQuotes = false

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]

    if (ch === '\\' && input[i + 1] === '"') {
      current += '"'
      hasToken = true
      i++
      continue
    }

    if (ch === '"') {
      inQuotes = !inQuotes
      /* 引号本身不进内容，但它开启了一个参数：`""` 要产生一个空参数，
         否则 `tool ""` 这种"显式传空"的写法会静默少一个参数。 */
      hasToken = true
      continue
    }

    if (!inQuotes && /\s/.test(ch)) {
      if (hasToken) {
        out.push(current)
        current = ''
        hasToken = false
      }
      continue
    }

    current += ch
    hasToken = true
  }

  if (hasToken) out.push(current)
  return out
}

/** 单个参数的引用规则：含空白或双引号时用双引号包起来，内部的双引号转义 */
function quoteArgument(value: string): string {
  return value === '' || /[\s"]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value
}

/**
 * 把参数数组拼回**一条 Windows 命令行片段**（含空格或引号的参数用双引号包起来）。
 *
 * 用途只有一个：`Start-Process -ArgumentList` 只接受字符串，它会把字符串原样拼到
 * 子进程的命令行上，子进程再用 `CommandLineToArgvW` 解析回来——所以这里必须做
 * 与解析规则对偶的**再引用**，否则 `--title=a b` 会在提权启动时被拆成两个参数。
 *
 * ⚠️ 这是「数组 → 字符串」方向，只在这条不得不走字符串的通道上使用。
 * 常规启动走的是 `spawn(command, args[], { shell: false })`，**不经过本函数**。
 */
export function formatWindowsArguments(args: string[]): string {
  return args.map(quoteArgument).join(' ')
}

/**
 * 把命令与参数拼成一行**仅供展示**的命令预览。
 *
 * 只用于界面提示，不参与实际执行——实际执行走参数数组，不存在拼串再解析的过程。
 * 含空格或引号的参数用双引号包起来，让用户能一眼看出参数的边界。
 */
export function formatCommandPreview(command: string, args: string[]): string {
  return [command, ...args].map(quoteArgument).join(' ')
}
