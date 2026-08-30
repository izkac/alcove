; Start Alcove when this user signs in. Skip if they turned it off in Settings.
; The stock Tauri uninstaller also deletes HKCU Run\${PRODUCTNAME} on uninstall.

!macro NSIS_HOOK_POSTINSTALL
  IfFileExists "$APPDATA\com.alcove.desktop\autostart-off" alcove_skip_run 0
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCTNAME}" '"$INSTDIR\${MAINBINARYNAME}.exe"'
  alcove_skip_run:
!macroend
