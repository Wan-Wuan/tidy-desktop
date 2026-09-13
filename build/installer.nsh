!macro customCheckAppRunning
  ; 本应用"关闭窗口 = 最小化到托盘"，进程对 WM_CLOSE 不会真正退出；
  ; 默认检测流程对这类托盘常驻应用会以"安装没有完成"告终。
  ; 这里直接结束安装目录下的应用进程：先请求退出，再强制结束，确保升级总能完成。
  DetailPrint `Checking for running "${PRODUCT_NAME}"...`
  nsExec::Exec `"$SYSDIR\cmd.exe" /C taskkill /IM "${APP_EXECUTABLE_FILENAME}" /T 1>nul 2>nul`
  Pop $0
  ${if} $0 == 0
    Sleep 800
  ${endIf}
  StrCpy $1 0
  retry_force_kill:
    nsExec::Exec `"$SYSDIR\cmd.exe" /C taskkill /F /IM "${APP_EXECUTABLE_FILENAME}" /T 1>nul 2>nul`
    Pop $0
    ${if} $0 == 0
      IntOp $1 $1 + 1
      ${if} $1 <= 10
        Sleep 500
        Goto retry_force_kill
      ${endIf}
      MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDCANCEL IDRETRY retry_force_kill
      Quit
    ${endIf}
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
