import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { test } from 'node:test'

// Explicit opt-in command: opens the real Windows dialog, checks it is visible
// and in the foreground, then closes only that dialog on its own UI thread.
for (const locale of ['zh-CN', 'en-US']) for (const directory of [false, true]) for (const accept of [false, true]) {
test(`Windows ${locale} ${directory ? 'folder' : 'file'} dialog: foreground and ${accept ? 'selection' : 'cancellation'}`, { skip: process.platform !== 'win32', timeout: 20000 }, async () => {
  const source = await readFile(new URL('../../packages/browser-use/browser-use-domain/src/windows-picker-script.ts', import.meta.url), 'utf8')
  const script = source.slice(source.indexOf('`') + 1, source.lastIndexOf('`'))
  const probe = String.raw`
public static class PickerSmoke {
    delegate bool EnumWindow(IntPtr window, IntPtr param);
    [DllImport("user32.dll")] static extern bool EnumThreadWindows(uint thread, EnumWindow callback, IntPtr param);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr window, StringBuilder text, int count);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool PostMessage(IntPtr window, uint message, IntPtr w, IntPtr l);
    static System.Windows.Forms.Timer timer;
    static bool visible, foreground;
    public static void Start() {
        bool chinese = Thread.CurrentThread.CurrentUICulture.TwoLetterISOLanguageName == "zh";
        string computer = BrowserPathPicker.ProbeDisplayName("shell:::{20D04FE0-3AEA-1069-A2D8-08002B30309D}");
        string network = BrowserPathPicker.ProbeDisplayName("shell:::{F02C1A0D-BE21-4350-88B0-7367FC96EF3C}");
        if (computer != (chinese ? "此电脑" : "This PC") || network != (chinese ? "网络" : "Network"))
            throw new Exception("Unexpected Shell language: " + computer + ", " + network);
        timer = new System.Windows.Forms.Timer();
        timer.Interval = 300;
        timer.Tick += delegate {
            EnumThreadWindows(GetCurrentThreadId(), delegate(IntPtr window, IntPtr ignored) {
                var title = new StringBuilder(256);
                GetWindowText(window, title, title.Capacity);
                bool folder = Environment.GetEnvironmentVariable("DSH_BROWSER_PICKER_DIRECTORY") == "1";
                string expected = folder ? (chinese ? "选择浏览器用户数据目录" : "Select browser user data directory")
                    : (chinese ? "选择浏览器可执行文件" : "Select browser executable");
                if (title.ToString() != expected) return true;
                visible = IsWindowVisible(window);
                foreground = GetForegroundWindow() == window;
                if (!visible) return true;
                timer.Stop();
                if (Environment.GetEnvironmentVariable("DSH_PICKER_SMOKE_ACCEPT") == "1") {
                    PostMessage(window, 0x111, new IntPtr(1), IntPtr.Zero); // WM_COMMAND / IDOK
                } else {
                    PostMessage(window, 0x10, IntPtr.Zero, IntPtr.Zero); // WM_CLOSE
                }
                return false;
            }, IntPtr.Zero);
        };
        timer.Start();
    }
    public static void Verify() {
        timer.Dispose();
        if (!visible || !foreground) throw new Exception("Dialog visible=" + visible + ", foreground=" + foreground);
    }
}
`
  const shellProbe = `
    public static string ProbeDisplayName(string value) {
        var id = typeof(IBrowserShellItem).GUID;
        IBrowserShellItem item;
        SHCreateItemFromParsingName(value, IntPtr.Zero, ref id, out item);
        try {
            IntPtr name;
            item.GetDisplayName(0, out name);
            try { return Marshal.PtrToStringUni(name); } finally { Marshal.FreeCoTaskMem(name); }
        } finally { Marshal.ReleaseComObject(item); }
    }
  `
  const smoke = script.replace('using System;', 'using System;\nusing System.Text;')
    .replace("\n'@", `\n${probe}\n'@`)
    .replace('public static class BrowserPathPicker {', `public static class BrowserPathPicker {\n${shellProbe}`)
    .replace('Application.EnableVisualStyles();', 'Application.EnableVisualStyles(); PickerSmoke.Start();')
    .replace('selected = Pick(owner.Handle, initial, directory);', 'selected = Pick(owner.Handle, initial, directory); PickerSmoke.Verify();')
  const initialPath = directory ? process.cwd() : process.execPath
  const { stdout, stderr } = await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-Command', smoke], {
    env: { ...process.env, DSH_BROWSER_PICKER_DIRECTORY: directory ? '1' : '0', DSH_BROWSER_PICKER_INITIAL: initialPath, DSH_BROWSER_PICKER_LOCALE: locale, DSH_PICKER_SMOKE_ACCEPT: accept ? '1' : '0' },
    windowsHide: true,
    timeout: 15000,
    encoding: 'utf8',
  })
  assert.equal(stdout.trim().toLowerCase(), accept ? initialPath.toLowerCase() : '')
  assert.equal(stderr.trim(), '')
})
}
