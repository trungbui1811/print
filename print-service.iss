[Setup]
AppName=Print Service
AppVersion=1.0
DefaultDirName={pf}\PrintService
OutputDir=.
OutputBaseFilename=PrintServiceInstaller
Compression=lzma
DisableDirPage=yes
DisableProgramGroupPage=yes

[Files]
Source: "print-service.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "SumatraPDF-3.4.6-32.exe"; DestDir: "{app}"; Flags: ignoreversion

[Run]
Filename: "{app}\print-service.exe"; Flags: nowait runhidden

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; \
    ValueName: "PrintService"; ValueData: """{app}\print-service.exe"""; Flags: uninsdeletevalue
