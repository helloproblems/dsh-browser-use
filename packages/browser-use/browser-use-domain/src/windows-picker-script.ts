/** Windows chooser setup; the initial path is passed as data through the environment. */
export const WINDOWS_PICKER_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
Add-Type -ReferencedAssemblies System.Windows.Forms -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
public static class BrowserPickerWindow {
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetUserPreferredUILanguages(uint flags, out uint count, IntPtr languages, ref uint length);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetProcessPreferredUILanguages(uint flags, IntPtr languages, out uint count);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetThreadPreferredUILanguages(uint flags, IntPtr languages, out uint count);
    [DllImport("kernel32.dll")]
    private static extern ushort SetThreadUILanguage(ushort language);
    public static void PrepareLanguage() {
        // PowerShell 5.1 may start in en-US even on a Chinese Windows desktop.
        // Read the user's display languages, not regional formats or our title.
        const uint MUI_LANGUAGE_NAME = 0x8;
        uint count, length = 0;
        if (!GetUserPreferredUILanguages(MUI_LANGUAGE_NAME, out count, IntPtr.Zero, ref length))
            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        IntPtr languages = Marshal.AllocHGlobal(checked((int)length * 2));
        IntPtr requestedLanguages = IntPtr.Zero;
        try {
            if (!GetUserPreferredUILanguages(MUI_LANGUAGE_NAME, out count, languages, ref length))
                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
            string first = Marshal.PtrToStringUni(languages);
            string requested = Environment.GetEnvironmentVariable("DSH_BROWSER_PICKER_LOCALE");
            if (!String.IsNullOrWhiteSpace(requested)) {
                try {
                    first = System.Globalization.CultureInfo.CreateSpecificCulture(requested).Name;
                    // Keep Windows display languages as fallbacks when the DSH
                    // language has no installed native resources.
                    requestedLanguages = Marshal.StringToHGlobalUni(first + "\0" + Marshal.PtrToStringUni(languages, (int)length));
                } catch (System.Globalization.CultureNotFoundException) {
                    // Language-pack IDs unknown to this OS use its own UI locale.
                }
            }
            if (!String.IsNullOrEmpty(first)) {
                var culture = System.Globalization.CultureInfo.GetCultureInfo(first);
                System.Threading.Thread.CurrentThread.CurrentUICulture = culture;
                SetThreadUILanguage((ushort)culture.LCID);
            }
            // .NET culture may change the thread language; apply native
            // preferences last and preserve the full Windows fallback list.
            IntPtr preferred = requestedLanguages == IntPtr.Zero ? languages : requestedLanguages;
            if (!SetProcessPreferredUILanguages(MUI_LANGUAGE_NAME, preferred, out count)
                || !SetThreadPreferredUILanguages(MUI_LANGUAGE_NAME, preferred, out count))
                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        } finally {
            if (requestedLanguages != IntPtr.Zero) Marshal.FreeHGlobal(requestedLanguages);
            Marshal.FreeHGlobal(languages);
        }
    }
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
[ComImport, Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")]
class BrowserPathDialogCom { }
[ComImport, Guid("D57C7288-D4AD-4768-BE02-9D969532D960"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IBrowserPathDialog {
    [PreserveSig] int Show(IntPtr owner);
    void SetFileTypes(uint count, IntPtr types);
    void SetFileTypeIndex(uint index);
    void GetFileTypeIndex(out uint index);
    void Advise(IntPtr events, out uint cookie);
    void Unadvise(uint cookie);
    void SetOptions(uint options);
    void GetOptions(out uint options);
    void SetDefaultFolder(IBrowserShellItem folder);
    void SetFolder(IBrowserShellItem folder);
    void GetFolder(out IBrowserShellItem folder);
    void GetCurrentSelection(out IBrowserShellItem item);
    void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string name);
    void GetFileName(out IntPtr name);
    void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string title);
    void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
    void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
    void GetResult(out IBrowserShellItem item);
}
[ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IBrowserShellItem {
    void BindToHandler(IntPtr context, ref Guid handler, ref Guid id, out IntPtr result);
    void GetParent(out IBrowserShellItem parent);
    void GetDisplayName(uint kind, out IntPtr name);
}
public static class BrowserPathPicker {
    public static string Show(string initial, bool directory) {
        string selected = null;
        Exception failure = null;
        // PowerShell restores its runspace culture on the main thread. Own a
        // dedicated STA thread so managed and native UI languages stay aligned.
        var thread = new Thread(delegate() {
            try {
                BrowserPickerWindow.PrepareLanguage();
                BrowserPickerWindow.PrepareDpi();
                Application.EnableVisualStyles();
                using (var owner = new Form()) {
                    owner.ShowInTaskbar = false;
                    owner.TopMost = true;
                    owner.Opacity = 0;
                    owner.Width = owner.Height = 1;
                    owner.StartPosition = FormStartPosition.CenterScreen;
                    BrowserPickerWindow.Activate();
                    owner.Show();
                    owner.Activate();
                    selected = Pick(owner.Handle, initial, directory);
                }
            } catch (Exception error) { failure = error; }
        });
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        thread.Join();
        if (failure != null) throw failure;
        return selected;
    }
    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
    static extern void SHCreateItemFromParsingName(string path, IntPtr context, ref Guid id, out IBrowserShellItem item);
    public static string Pick(IntPtr owner, string initial, bool directory) {
        var dialog = (IBrowserPathDialog)new BrowserPathDialogCom();
        try {
            // Filesystem paths, preserve cwd, existing path, single selection.
            // Folders add FOS_PICKFOLDERS; files add FOS_FILEMUSTEXIST.
            dialog.SetOptions((uint)(0x40 | 0x8 | 0x800 | (directory ? 0x20 : 0x1000)));
            bool chinese = Thread.CurrentThread.CurrentUICulture.TwoLetterISOLanguageName == "zh";
            dialog.SetTitle(directory
                ? (chinese ? "选择浏览器用户数据目录" : "Select browser user data directory")
                : (chinese ? "选择浏览器可执行文件" : "Select browser executable"));
            string initialFolder = initial;
            if (!directory && !String.IsNullOrWhiteSpace(initial) && !System.IO.Directory.Exists(initial)) {
                initialFolder = System.IO.Path.GetDirectoryName(initial);
                dialog.SetFileName(System.IO.Path.GetFileName(initial));
            }
            if (!String.IsNullOrWhiteSpace(initialFolder) && System.IO.Directory.Exists(initialFolder)) {
                var id = typeof(IBrowserShellItem).GUID;
                IBrowserShellItem folder;
                SHCreateItemFromParsingName(initialFolder, IntPtr.Zero, ref id, out folder);
                try { dialog.SetFolder(folder); } finally { Marshal.ReleaseComObject(folder); }
            }
            BrowserPickerWindow.Activate();
            int result = dialog.Show(owner);
            if (result == unchecked((int)0x800704C7)) return null;
            Marshal.ThrowExceptionForHR(result);
            IBrowserShellItem selected;
            dialog.GetResult(out selected);
            try {
                IntPtr path;
                selected.GetDisplayName(0x80058000, out path); // SIGDN_FILESYSPATH
                try { return Marshal.PtrToStringUni(path); } finally { Marshal.FreeCoTaskMem(path); }
            } finally { Marshal.ReleaseComObject(selected); }
        } finally { Marshal.ReleaseComObject(dialog); }
    }
}
'@
$directory = $env:DSH_BROWSER_PICKER_DIRECTORY -eq '1'
$selected = [BrowserPathPicker]::Show($env:DSH_BROWSER_PICKER_INITIAL, $directory)
if ($selected) { [Console]::Out.Write($selected) }
`
