/** Windows chooser setup; the initial path is passed as data through the environment. */
export const WINDOWS_PICKER_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class BrowserPickerWindow {
    [DllImport("user32.dll")]
    private static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll")]
    private static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")]
    private static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);
    public static void PrepareDpi() {
        try {
            foreach (int context in new int[] { -4, -3, -2 }) {
                if (SetThreadDpiAwarenessContext(new IntPtr(context)) != IntPtr.Zero) return;
            }
        } catch (EntryPointNotFoundException) {
            // Older Windows only supports process-wide DPI awareness.
        }
        SetProcessDPIAware();
    }
    public static void Activate() {
        // Match the workspace picker: let a background host's chooser take focus.
        keybd_event(0x12, 0, 0, UIntPtr.Zero);
        keybd_event(0x12, 0, 2, UIntPtr.Zero);
    }
}
'@
[BrowserPickerWindow]::PrepareDpi()
Add-Type -AssemblyName System.Windows.Forms
# WinForms requires visual styles to use its modern IFileDialog implementation.
[System.Windows.Forms.Application]::EnableVisualStyles()
$dialog = New-Object System.Windows.Forms.OpenFileDialog
try {
    $dialog.AutoUpgradeEnabled = $true
    $dialog.Title = '选择浏览器可执行文件'
    $dialog.Filter = '所有文件 (*.*)|*.*'
    $dialog.CheckFileExists = $true
    $dialog.CheckPathExists = $true
    $dialog.Multiselect = $false
    $dialog.RestoreDirectory = $true
    $initial = $env:DSH_BROWSER_PICKER_INITIAL
    if ($initial) {
        if (Test-Path -LiteralPath $initial -PathType Container) {
            $dialog.InitialDirectory = $initial
        } else {
            $parent = [System.IO.Path]::GetDirectoryName($initial)
            if ($parent -and (Test-Path -LiteralPath $parent -PathType Container)) {
                $dialog.InitialDirectory = $parent
                $dialog.FileName = [System.IO.Path]::GetFileName($initial)
            }
        }
    }
    [BrowserPickerWindow]::Activate()
    if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        [Console]::Out.Write($dialog.FileName)
    }
} finally {
    $dialog.Dispose()
}
`
