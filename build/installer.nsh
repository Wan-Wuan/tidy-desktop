!macro customInstall
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
