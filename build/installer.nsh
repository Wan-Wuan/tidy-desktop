!macro customCheckAppRunning
  ; 本应用"关闭窗口 = 最小化到托盘"，进程对 WM_CLOSE 不会真正退出；
  ; 默认检测流程对这类托盘常驻应用会以"安装没有完成"告终。
  ;
  ; 这里用 electron-builder 自带 NSIS 的 nsProcess 插件按进程名结束后台常驻进程：
  ; 不派生任何外部命令（cmd / taskkill / PowerShell 都不需要），也不会有窗口闪出。
  ; 因此静默安装（应用内更新走的 /S 通道）和交互式安装在此处行为一致，且在没有
  ; 命令解释器的精简系统上同样可用。
  DetailPrint `Checking for running "${PRODUCT_NAME}"...`
  !insertmacro nsProcess::CloseProcess "${APP_EXECUTABLE_FILENAME}" $0
  ${if} $0 == 0
    Sleep 800
  ${endIf}

  StrCpy $1 0
  retry_force_kill:
    !insertmacro nsProcess::KillProcess "${APP_EXECUTABLE_FILENAME}" $0
    ${if} $0 == 0
      IntOp $1 $1 + 1
      ${if} $1 <= 10
        Sleep 500
        Goto retry_force_kill
      ${endIf}
      ; 静默安装不能弹出任何界面：应用内更新此时已经没有前台窗口，
      ; 弹框只会把人卡住。交互式安装才让用户决定重试还是取消。
      ${IfNot} ${Silent}
        MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDCANCEL IDRETRY retry_force_kill
      ${EndIf}
      Quit
    ${endIf}

  ; 更新助手跑的是应用自身的可执行文件，spawn 安装器后会立刻退出，
  ; 但进程收尾和文件句柄释放仍需要一点时间，期间 exe 处于锁定状态。
  ; 这里的等待是纯 NSIS 指令，不依赖任何外部命令——即使上面的进程结束
  ; 一步没生效，也能留出足够的退出窗口，避免覆盖文件时撞锁。
  Sleep 1200
!macroend

!macro customInstall
  ; 开发调试残留清理：dev 实例的通知功能会让 Chromium 在开始菜单创建 Electron.lnk，
  ; 旧版代码下它携带与发布应用相同的 AUMID，Explorer 解析任务栏按钮图标时
  ; 会按 AUMID 匹配到这个快捷方式、显示 electron.exe 的默认图标。
  ${if} ${FileExists} "$SMPROGRAMS\Electron.lnk"
    Delete "$SMPROGRAMS\Electron.lnk"
  ${endIf}

  ${if} ${FileExists} "$INSTDIR\resources\build\app-icon.ico"
    ; 图标文件按版本号落盘：Windows 任务栏按「图标路径」缓存按钮图标，且不因覆盖安装、
    ; SHChangeNotify、Explorer 重启而失效（旧版本 ≤2.6.6 的非法 ICO 会把错误图标永久
    ; 留在缓存里）。每个版本写一份独立文件名并让快捷方式指向它，强制 Shell 重新解码，
    ; 老机器升级后任务栏图标自动修复。
    CopyFiles /SILENT "$INSTDIR\resources\build\app-icon.ico" "$INSTDIR\resources\build\app-icon-${VERSION}.ico"

    ${if} ${FileExists} "$newDesktopLink"
      Delete "$newDesktopLink"
      CreateShortCut "$newDesktopLink" "$appExe" "" "$INSTDIR\resources\build\app-icon-${VERSION}.ico" 0 "" "" "${APP_DESCRIPTION}"
      ClearErrors
      WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
    ${endIf}

    ${if} ${FileExists} "$newStartMenuLink"
      Delete "$newStartMenuLink"
      CreateShortCut "$newStartMenuLink" "$appExe" "" "$INSTDIR\resources\build\app-icon-${VERSION}.ico" 0 "" "" "${APP_DESCRIPTION}"
      ClearErrors
      WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
    ${endIf}

    System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
  ${endIf}
!macroend
