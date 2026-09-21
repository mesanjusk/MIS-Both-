# MIS local/network file opener

The live dashboard is served over HTTPS. Modern browsers block an HTTPS page from directly opening a `file://` path on a PC or SMB share.

The Bills screen therefore uses a small Windows protocol handler:

- Dashboard link: `misfile://...`
- Windows handler: opens the requested local/UNC path in File Explorer
- Network use: configure the Bills share root as a UNC path such as `\\OFFICE-SERVER\Orders`

## Install once on every Windows PC

1. Download `Install-MISLocalFileOpener.ps1`.
2. Run PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\Install-MISLocalFileOpener.ps1
```

The installer writes only to the current user's profile (`HKCU`) and does not require admin rights in normal Windows setups.

To uninstall:

```powershell
powershell -ExecutionPolicy Bypass -File .\Install-MISLocalFileOpener.ps1 -Uninstall
```

## Bills setup

On the Bills page, open **Local folder setup** and enter the root folder that contains the Google Drive-synced order files.

For LAN access, use a UNC share rather than a mapped drive letter:

```text
\\OFFICE-SERVER\SharedOrders
```

The setting is stored only in that browser's local storage. The file path is copied to the clipboard before launch as a fallback.
