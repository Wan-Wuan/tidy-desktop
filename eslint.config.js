// ESLint 9 扁平配置（flat config）。
//
// 设计原则：首轮规则全部设为 warn（非 error）。目的是先建立 lint 基线、把历史
// 告警暴露出来，而不是用 error 直接阻断开发与构建；后续再逐步把关键规则收紧成 error。
//
// 这里不引入 typescript-eslint 的 recommended 预设，因为它自带若干 error 级规则，
// 会与「首轮全部 warn」的约定冲突；改为手动挂载 TS 解析器与插件，只启用我们
// 明确设为 warn 的规则。
//
// 为什么引入 react-hooks 插件：项目刚修过一个「useEffect 依赖数组为空却调用读
// config 函数」导致的过期闭包 bug，react-hooks/exhaustive-deps 能在编辑期抓出同类问题。
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default tseslint.config(
  {
    // 全局忽略：构建产物、第三方依赖、临时目录不参与 lint；*.cjs 是脚本非 ESM，跳过。
    ignores: ['dist/**', 'release/**', 'node_modules/**', 'build/**', '**/*.cjs'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 2020,
      sourceType: 'module',
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // 清理过期闭包类 bug 的关键规则，先以 warn 暴露问题。
      '@typescript-eslint/no-unused-vars': 'warn',
      'react-hooks/rules-of-hooks': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      // 渲染层组件热更新相关约定，仅作提示（可选）。
      'react-refresh/only-export-components': 'warn',
    },
  }
)
