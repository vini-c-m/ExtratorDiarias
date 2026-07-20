; Sprint 08 — o electron-builder recusa usar `productName` como nome da
; pasta de instalação quando ele contém caractere acentuado (`getWindowsInstallationDirName`
; em app-builder-lib só aceita `[-_+0-9a-zA-Z .]`), caindo de volta para o
; `name` do package.json ("extrator-diarias-frontend") — não o caminho
; pedido pela Sprint. `customInit` roda logo depois da lógica padrão
; (`initMultiUser`) em installer.nsi, então sobrescrever `$INSTDIR` aqui
; força exatamente "C:\Program Files\Extrator de Diárias".
!macro customInit
  StrCpy $INSTDIR "$PROGRAMFILES64\Extrator de Diárias"
!macroend
