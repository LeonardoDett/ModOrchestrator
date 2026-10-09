Unicode true

####
## Per-user installer of Mod Orchestrator (plano-de-publicacao.md, etapa 2;
## D077 item 3; D103). `wails build -nsis` keeps this file and regenerates
## wails_tools.nsh next to it.
##
## - Installs in %LOCALAPPDATA%\Programs\ModOrchestrator without UAC: no
##   administrator rights, registry only under HKCU.
## - The uninstaller removes the program files it installed. It keeps the
##   app data (%APPDATA%\ModOrchestrator: database, backups, logs) unless the
##   user ticks the option, and never touches staging, archives, backups of
##   originals or game folders.
##
## Manual build (after one `wails build -nsis` populated wails_tools.nsh):
## > makensis -DARG_WAILS_AMD64_BINARY=..\..\bin\ModOrchestrator.exe project.nsi
####

!define REQUEST_EXECUTION_LEVEL "user"
!define UNINST_KEY_NAME "ModOrchestrator"
!define DATA_DIR_NAME "ModOrchestrator"

!include "wails_tools.nsh"

# The version information for this two must consist of 4 parts
VIProductVersion "${INFO_PRODUCTVERSION}.0"
VIFileVersion    "${INFO_PRODUCTVERSION}.0"

VIAddVersionKey "CompanyName"     "${INFO_COMPANYNAME}"
VIAddVersionKey "FileDescription" "${INFO_PRODUCTNAME} Installer"
VIAddVersionKey "ProductVersion"  "${INFO_PRODUCTVERSION}"
VIAddVersionKey "FileVersion"     "${INFO_PRODUCTVERSION}"
VIAddVersionKey "LegalCopyright"  "${INFO_COPYRIGHT}"
VIAddVersionKey "ProductName"     "${INFO_PRODUCTNAME}"

ManifestDPIAware true

!include "MUI2.nsh"
!include "LogicLib.nsh"

!define MUI_ICON "..\icon.ico"
!define MUI_UNICON "..\icon.ico"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\${PRODUCT_EXECUTABLE}"
!define MUI_UNCOMPONENTSPAGE_NODESC

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_COMPONENTS
!insertmacro MUI_UNPAGE_INSTFILES

# The first language is the fallback; NSIS picks the one of the system.
!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "PortugueseBR"

LangString SecApp ${LANG_ENGLISH} "Mod Orchestrator"
LangString SecApp ${LANG_PORTUGUESEBR} "Mod Orchestrator"
LangString SecDesktop ${LANG_ENGLISH} "Desktop shortcut"
LangString SecDesktop ${LANG_PORTUGUESEBR} "Atalho na área de trabalho"
LangString SecUnApp ${LANG_ENGLISH} "Program files"
LangString SecUnApp ${LANG_PORTUGUESEBR} "Arquivos do programa"
LangString SecUnData ${LANG_ENGLISH} "Also delete settings, database, backups and logs (%APPDATA%\${DATA_DIR_NAME}). Mods, staging and game folders are never deleted."
LangString SecUnData ${LANG_PORTUGUESEBR} "Apagar também configurações, banco, backups e logs (%APPDATA%\${DATA_DIR_NAME}). Mods, staging e pastas de jogo nunca são apagados."
LangString MsgRunning ${LANG_ENGLISH} "Mod Orchestrator is still open. Close it and click Retry."
LangString MsgRunning ${LANG_PORTUGUESEBR} "O Mod Orchestrator ainda está aberto. Feche-o e clique em Repetir."
LangString MsgDataWarning ${LANG_ENGLISH} "Deleting the app data forgets which files Mod Orchestrator deployed. Files still deployed in game folders stay there and a new installation will treat them as unmanaged. Purge your games in the app first if you want them removed.$\n$\nDelete the app data?"
LangString MsgDataWarning ${LANG_PORTUGUESEBR} "Apagar os dados do app esquece quais arquivos o Mod Orchestrator implantou. Arquivos ainda implantados nas pastas dos jogos continuam lá, e uma nova instalação vai tratá-los como não gerenciados. Faça o purge dos jogos no app antes, se quiser removê-los.$\n$\nApagar os dados do app?"

Name "${INFO_PRODUCTNAME}"
OutFile "..\..\bin\${INFO_PROJECTNAME}-${ARCH}-installer.exe"
# Per user, no elevation: %LOCALAPPDATA%\Programs is the per-user Program
# Files. A previous installation is found through the registry.
InstallDir "$LOCALAPPDATA\Programs\${INFO_PROJECTNAME}"
InstallDirRegKey HKCU "${UNINST_KEY}" "InstallLocation"
ShowInstDetails show
ShowUninstDetails show

Function .onInit
    !insertmacro wails.checkArchitecture
    SetShellVarContext current
FunctionEnd

Function un.onInit
    SetShellVarContext current
FunctionEnd

# Replacing the executable fails while the app runs: after an update the
# app is closing, so wait a moment before asking.
!macro WaitForExecutable UN
Function ${UN}WaitForExecutable
    StrCpy $0 0
    ${DoWhile} ${FileExists} "$INSTDIR\${PRODUCT_EXECUTABLE}"
        ClearErrors
        FileOpen $1 "$INSTDIR\${PRODUCT_EXECUTABLE}" a
        ${IfNot} ${Errors}
            FileClose $1
            ${Break}
        ${EndIf}
        IntOp $0 $0 + 1
        ${If} $0 > 20
            MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(MsgRunning)" /SD IDCANCEL IDRETRY retry
            Abort
            retry:
            StrCpy $0 0
        ${EndIf}
        Sleep 500
    ${Loop}
FunctionEnd
!macroend
!insertmacro WaitForExecutable ""
!insertmacro WaitForExecutable "un."

Section "$(SecApp)" SecAppId
    SectionIn RO
    SetOutPath $INSTDIR
    Call WaitForExecutable

    !insertmacro wails.webview2runtime

    SetOutPath $INSTDIR
    !insertmacro wails.files
    File "/oname=LICENSE.txt" "..\..\..\LICENSE"

    CreateShortcut "$SMPROGRAMS\${INFO_PRODUCTNAME}.lnk" "$INSTDIR\${PRODUCT_EXECUTABLE}"

    WriteUninstaller "$INSTDIR\uninstall.exe"
    WriteRegStr HKCU "${UNINST_KEY}" "Publisher" "${INFO_COMPANYNAME}"
    WriteRegStr HKCU "${UNINST_KEY}" "DisplayName" "${INFO_PRODUCTNAME}"
    WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion" "${INFO_PRODUCTVERSION}"
    WriteRegStr HKCU "${UNINST_KEY}" "DisplayIcon" "$INSTDIR\${PRODUCT_EXECUTABLE}"
    WriteRegStr HKCU "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
    WriteRegStr HKCU "${UNINST_KEY}" "URLInfoAbout" "https://github.com/LeonardoDett/ModOrchestrator"
    WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" "$\"$INSTDIR\uninstall.exe$\""
    WriteRegStr HKCU "${UNINST_KEY}" "QuietUninstallString" "$\"$INSTDIR\uninstall.exe$\" /S"
    WriteRegDWORD HKCU "${UNINST_KEY}" "NoModify" 1
    WriteRegDWORD HKCU "${UNINST_KEY}" "NoRepair" 1
    ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
    IntFmt $0 "0x%08X" $0
    WriteRegDWORD HKCU "${UNINST_KEY}" "EstimatedSize" "$0"
SectionEnd

Section "$(SecDesktop)" SecDesktopId
    CreateShortcut "$DESKTOP\${INFO_PRODUCTNAME}.lnk" "$INSTDIR\${PRODUCT_EXECUTABLE}"
SectionEnd

Section "un.$(SecUnApp)" SecUnAppId
    SectionIn RO
    Call un.WaitForExecutable
    # Only what the installer put there: the folder may have been chosen by
    # the user and hold other files, so it is never removed recursively.
    Delete "$INSTDIR\${PRODUCT_EXECUTABLE}"
    Delete "$INSTDIR\LICENSE.txt"
    Delete "$INSTDIR\uninstall.exe"
    RMDir "$INSTDIR"

    Delete "$SMPROGRAMS\${INFO_PRODUCTNAME}.lnk"
    Delete "$DESKTOP\${INFO_PRODUCTNAME}.lnk"

    DeleteRegKey HKCU "${UNINST_KEY}"
SectionEnd

# Unticked by default: app data stays unless the user asks.
Section /o "un.$(SecUnData)" SecUnDataId
    MessageBox MB_YESNO|MB_ICONEXCLAMATION "$(MsgDataWarning)" /SD IDNO IDYES remove
    Goto done
    remove:
    RMDir /r "$APPDATA\${DATA_DIR_NAME}"
    # The WebView2 cache of the window (Wails default user data folder).
    RMDir /r "$APPDATA\${PRODUCT_EXECUTABLE}"
    done:
SectionEnd
