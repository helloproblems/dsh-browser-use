/** Settings copy, selected from the active DSH locale; other languages use English. */
const en = {
  section: 'Browser automation',
  browserType: 'Browser type',
  browserTypeDescription: 'Switch browsers after saving, without restarting. Existing browser sessions will be released.',
  headless: 'Headless mode',
  headlessDescription: 'Hide the browser window when the backend launches it.',
  browserPath: 'Browser location',
  browserPathDescription: 'Leave blank for automatic detection. Select the installation directory to locate the executable, or enter its full path manually.',
  browserPathPlaceholder: 'Automatically detect the selected browser',
  userDataDir: 'Browser user data directory',
  userDataDirDescription: 'Choose a directory on the DSH host to store data, separated by workspace and browser type. Leave blank for temporary isolated sessions.',
  userDataDirPlaceholder: 'Leave blank for temporary isolated sessions',
  isolation: 'Data isolation level',
  isolationDescription: 'Workspace: reuse data in the same working directory; only one session per browser type can use it at a time. Session: keep separate data for each session and reuse it when that session resumes. A blank directory always uses temporary isolation.',
  workspace: 'Workspace',
  session: 'Session',
  select: 'Select',
  selectPath: 'Select {name}',
  cancel: 'Cancel',
  cancelHint: 'Waiting for the system dialog; click to cancel',
  save: 'Save',
  saving: 'Saving…',
  loading: 'Loading settings…',
  unavailable: 'Browser automation settings are unavailable.',
  invalidSettings: 'Invalid browser automation settings.',
  absoluteDirectory: 'The browser user data directory must be an absolute path.',
  unknownBrowser: 'Cannot identify the browser from the filename. Choose the {browser} executable, or clear the location for automatic detection.',
  mismatchedBrowser: 'The executable does not match {browser}. Choose the correct browser, or clear the location for automatic detection.',
  pickerTimeout: 'The selection dialog timed out. Try again or enter the path manually.',
  browserPickerFailed: 'Could not select the browser location.',
  directoryPickerFailed: 'Could not select the user data directory.',
  loadFailed: 'Could not load settings.',
  saveFailed: 'Could not save settings.',
  browserNotFound: 'No {browser} executable was found in the selected directory. Select its installation directory or enter the executable path manually.',
}

export type CopyKey = keyof typeof en
const zh: Record<CopyKey, string> = {
  section: '浏览器自动化',
  browserType: '浏览器类型',
  browserTypeDescription: '保存后切换浏览器，无需重启；旧浏览器会话将被释放。',
  headless: '无头模式',
  headlessDescription: '由后端启动浏览器时不显示浏览器窗口。',
  browserPath: '浏览器位置',
  browserPathDescription: '留空时自动检索；点击选择浏览器安装目录，自动定位可执行文件，也可手动填写文件路径。',
  browserPathPlaceholder: '自动检索所选浏览器',
  userDataDir: '浏览器用户数据目录',
  userDataDirDescription: '选择 DSH 所在电脑上的文件夹作为数据根目录，自动按工作区和浏览器类型隔离；留空使用临时隔离模式。',
  userDataDirPlaceholder: '留空使用临时隔离模式',
  isolation: '数据隔离级别',
  isolationDescription: '工作区：同一工作目录复用数据，同类浏览器同时只能由一个会话使用。会话：每个会话独立保存数据，恢复同一会话时复用。目录留空时始终使用临时隔离模式。',
  workspace: '工作区',
  session: '会话',
  select: '选择',
  selectPath: '选择{name}',
  cancel: '取消选择',
  cancelHint: '正在等待系统选择窗口；点击取消选择',
  save: '保存',
  saving: '正在保存…',
  loading: '正在读取设置…',
  unavailable: '浏览器自动化设置不可用',
  invalidSettings: '浏览器自动化设置格式无效',
  absoluteDirectory: '浏览器用户数据目录必须填写绝对路径。',
  unknownBrowser: '无法从文件名确认浏览器类型，请选择 {browser} 的可执行文件，或清空位置以自动检索。',
  mismatchedBrowser: '浏览器位置与所选类型 {browser} 不匹配，请重新选择浏览器文件，或清空位置以自动检索。',
  pickerTimeout: '选择窗口等待超时，请重试或手动填写路径。',
  browserPickerFailed: '浏览器位置选择失败。',
  directoryPickerFailed: '用户数据目录选择失败。',
  loadFailed: '无法读取设置。',
  saveFailed: '无法保存设置。',
  browserNotFound: '所选目录中未找到 {browser} 可执行文件，请选择浏览器安装目录，或手动填写可执行文件路径。',
}

export function copy(locale: string | undefined, key: CopyKey, values: Record<string, string> = {}): string {
  const dict = locale?.toLowerCase().split('-')[0] === 'zh' ? zh : en
  return dict[key].replace(/\{(\w+)\}/g, (token, name: string) => values[name] ?? token)
}

/** Keep owned errors as keys so visible errors also update on language changes. */
export class SettingsError extends Error {
  constructor(readonly key: CopyKey, readonly values: Record<string, string> = {}) {
    super(copy('zh', key, values))
  }
}

export type DisplayError = { key: CopyKey; values?: Record<string, string>; detail?: string }
export function displayError(cause: unknown, fallback: CopyKey): DisplayError {
  if (cause instanceof SettingsError) return { key: cause.key, values: cause.values }
  return { key: fallback, detail: cause instanceof Error ? cause.message : String(cause) }
}

export function errorText(locale: string, error: DisplayError | null): string {
  if (!error) return ''
  const message = copy(locale, error.key, error.values)
  return error.detail ? `${message} ${error.detail}` : message
}
