import { createHash } from 'node:crypto'
import { setImmediate } from 'node:timers/promises'
import { Context } from '@deepseek-ai/cordis'
import { AttachmentId, AttachmentStore, type ImageAttachmentRef, type SaveImageAttachment } from '@deepseek-ai/dsh-attachment'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import { expect, it, vi } from 'vitest'
import BrowserUse, { browserUseBackendServiceKey, type BrowserUseBackend, type BrowserUseResult } from 'browser-use'
import { apply, inject } from '../src/index.ts'

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVZkAAAAASUVORK5CYII='
const screenshot: BrowserUseResult = { content: [{ type: 'text', text: 'Before' }, { type: 'image', mimeType: 'image/png', data: png }, { type: 'text', text: 'After' }], structuredContent: { ok: true } }

class MemoryAttachments extends AttachmentStore {
  readonly imageLimits = { maxImageBytes: 10000, maxImagesPerMessage: 5, maxMessageImageBytes: 50000, maxImagePixels: 100, maxImageDimension: 10, mediaTypes: ['image/png'] as const }
  readonly data = new Map<string, Uint8Array>()
  // Raster decoding belongs to the external attachment provider, mocked here.
  async validateImage() {}
  async saveImage(input: SaveImageAttachment): Promise<ImageAttachmentRef> {
    const attachmentId = AttachmentId(`sha256:${createHash('sha256').update(input.data).digest('hex')}`)
    this.data.set(attachmentId, input.data)
    return { attachmentId, mediaType: input.mediaType, bytes: input.data.byteLength, width: 1, height: 1 }
  }
  async readImage(ref: ImageAttachmentRef) { return { ref, data: this.data.get(ref.attachmentId)! } }
}

async function fixture(withAttachments = true) {
  const ctx = new Context()
  ctx.provide('systemPrompt', { tools: () => () => {} } as unknown as Context['systemPrompt'])
  const tools = new ToolRuntime(ctx, { mode: 'native' })
  const attachments = withAttachments ? new MemoryAttachments(ctx) : undefined
  const hub = await ctx.plugin(BrowserUse)
  const execute = vi.fn<BrowserUseBackend['execute']>(async () => screenshot)
  const backend: BrowserUseBackend = {
    browserType: 'chrome', tools: () => [{ name: 'action', description: '', parameters: { type: 'object' } }],
    execute, release() {}, reconfigure: async () => {}, close: async () => {},
  }
  ctx.browserUse.backend.register('chrome', backend)
  ctx.provide(browserUseBackendServiceKey('chrome'), backend)
  const domain = await ctx.plugin({ apply, inject }, { backend: 'chrome', browserType: 'chrome', browserPath: '', headless: true, toolCallTimeoutMs: 1000 })
  await vi.waitFor(() => expect(tools.schemas()).toHaveLength(1))
  type Execution = Parameters<ToolRuntime['execute']>[0]
  let count = 0
  const call = (signal = new AbortController().signal) => tools.execute({
    callId: `call-${++count}` as Execution['callId'], name: 'mcp__chrome__action', arguments: {},
    agent: {} as NonNullable<Execution['agent']>, signal,
  })
  return { ctx, attachments, execute, call, close: async () => { await domain.dispose(); await hub.dispose() } }
}

it('returns durable screenshots to the model and preserves the raw programmatic value', async () => {
  const f = await fixture()
  try {
    const result = await f.call()
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('unexpected tool error')
    expect(result.value).toEqual(screenshot)
    expect(result.content).toEqual([
      { type: 'text', text: 'Before' },
      { type: 'image', attachment: expect.objectContaining({ mediaType: 'image/png', width: 1, height: 1 }) },
      { type: 'text', text: 'After' },
    ])
    const replay = JSON.parse(JSON.stringify(result.content)) as typeof result.content
    const image = replay[1]!
    if (image.type !== 'image') throw new Error('missing durable image')
    expect(Buffer.from((await f.attachments!.readImage(image.attachment)).data).toString('base64')).toBe(png)
    expect(JSON.stringify(result.content)).not.toContain(png)
  } finally { await f.close() }
})

it('skips a browser call cancelled while waiting for another owner', async () => {
  const f = await fixture(false)
  let finish!: () => void
  const gate = new Promise<void>(resolve => { finish = resolve })
  f.execute.mockImplementation(async () => { await gate; return { content: [] } })
  try {
    const first = f.call()
    await vi.waitFor(() => expect(f.execute).toHaveBeenCalledOnce())
    const controller = new AbortController()
    const second = f.call(controller.signal)
    await setImmediate()
    controller.abort(new Error('cancelled'))
    finish()
    await first
    expect((await second).isError).toBe(true)
    expect(f.execute).toHaveBeenCalledOnce()
  } finally { finish(); await f.close() }
})

it('forwards the execution signal and does not publish images after cancellation during storage', async () => {
  const f = await fixture()
  let finish!: () => void
  const gate = new Promise<void>(resolve => { finish = resolve })
  const save = vi.spyOn(f.attachments!, 'saveImage')
  save.mockImplementation(async input => { await gate; return MemoryAttachments.prototype.saveImage.call(f.attachments!, input) })
  try {
    const controller = new AbortController()
    const running = f.call(controller.signal)
    await vi.waitFor(() => expect(save).toHaveBeenCalledOnce())
    expect(f.execute.mock.calls[0]![3]).toBe(controller.signal)
    controller.abort()
    finish()
    const result = await running
    expect(result.isError).toBe(true)
    expect(result.content.some(block => block.type === 'image')).toBe(false)
  } finally { finish(); await f.close() }
})

it('does not reinstate screenshots when a policy replaces their result', async () => {
  const f = await fixture()
  f.ctx.on('tools/post-execute', async () => ({ kind: 'accept', value: { content: [{ type: 'text', text: 'Replaced' }] } }))
  try {
    const result = await f.call()
    expect(result.isError).toBe(false)
    expect(result.content).toEqual([{ type: 'text', text: 'Replaced' }])
  } finally { await f.close() }
})

it('reports missing image storage while text-only tools still work', async () => {
  const f = await fixture(false)
  try {
    const result = await f.call()
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result.content)).toContain('attachment store')
    f.execute.mockResolvedValueOnce({ content: [{ type: 'text', text: 'Text only' }] })
    expect((await f.call()).content).toEqual([{ type: 'text', text: 'Text only' }])
  } finally { await f.close() }
})

it('rejects malformed screenshot encoding before committing attachments', async () => {
  const f = await fixture()
  f.execute.mockResolvedValueOnce({ content: [{ type: 'image', mimeType: 'image/png', data: 'not base64!' }] })
  try {
    expect((await f.call()).isError).toBe(true)
    expect(f.attachments!.data.size).toBe(0)
  } finally { await f.close() }
})
