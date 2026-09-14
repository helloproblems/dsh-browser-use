import type { Context } from '@deepseek-ai/cordis'
import type { PromptContentPart } from '@deepseek-ai/dsh-attachment'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'

export type BrowserModelContent = ReturnType<ToolDefinition['output']['render']>

/** Keep the synchronous renderer replayable; image admission happens in execute. */
export function browserTextContent(content: JsonValue[]): BrowserModelContent {
  const text = content.flatMap(item => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return []
    return item.type === 'text' && typeof item.text === 'string' ? [item.text] : []
  }).join('\n')
  return [{ type: 'text', text: text || '(no textual output)' }]
}

/** Persist MCP screenshots as DSH attachments while preserving text/image order. */
export async function prepareBrowserImages(ctx: Context, content: JsonValue[], signal: AbortSignal): Promise<BrowserModelContent | undefined> {
  const parts: PromptContentPart[] = []
  let hasImage = false
  for (const item of content) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) continue
    if (item.type === 'text' && typeof item.text === 'string') parts.push({ type: 'text', text: item.text })
    if (item.type !== 'image') continue
    hasImage = true
    const mediaType = item.mimeType
    if ((mediaType !== 'image/png' && mediaType !== 'image/jpeg' && mediaType !== 'image/webp' && mediaType !== 'image/gif')
      || typeof item.data !== 'string') throw new Error('Browser screenshot has an invalid image format')
    parts.push({ type: 'image', mediaType, data: item.data })
  }
  if (!hasImage) return undefined
  signal.throwIfAborted()
  const attachments = ctx.get('attachments')
  if (!attachments) throw new Error('Browser screenshots require a DSH attachment store')
  const admitted = await attachments.admitPromptContent(parts)
  signal.throwIfAborted()
  return admitted
}
