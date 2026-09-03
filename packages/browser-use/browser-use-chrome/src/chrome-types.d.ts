declare module 'chrome-devtools-mcp/build/src/browser.js' {
  export function ensureBrowserConnected(options: Record<string, unknown>): Promise<any>
  export function ensureBrowserLaunched(options: Record<string, unknown>): Promise<any>
  export function closeBrowser(): Promise<void>
}
declare module 'chrome-devtools-mcp/build/src/McpContext.js' {
  export class McpContext { static from(browser: any, logger: ((...args: unknown[]) => void) | undefined, options: Record<string, unknown>): Promise<McpContext>; dispose(): void }
}
declare module 'chrome-devtools-mcp/build/src/ToolHandler.js' {
  export class ToolHandler { readonly shouldRegister: boolean; readonly registeredInputSchema: unknown; constructor(tool: any, args: Record<string, unknown>, getContext: () => Promise<any>, mutex: any); handle(params: Record<string, unknown>): Promise<{ content?: unknown[]; structuredContent?: unknown; isError?: boolean }> }
}
declare module 'chrome-devtools-mcp/build/src/tools/tools.js' { export function createTools(args: Record<string, unknown>): any[] }
declare module 'chrome-devtools-mcp/build/src/third_party/index.js' { export class Mutex {} }
