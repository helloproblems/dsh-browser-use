import { describe, expect, it } from 'vitest'
import { createTools } from 'chrome-devtools-mcp/build/src/tools/tools.js'
import { ToolHandler } from 'chrome-devtools-mcp/build/src/ToolHandler.js'
import { Mutex } from 'chrome-devtools-mcp/build/src/third_party/index.js'
import { zodInputToJsonSchema } from '../src/json-schema.js'

const args = { usageStatistics: false, performanceCrux: false, pageIdRouting: false, slim: false }
describe('zodInputToJsonSchema', () => {
  it('projects Chrome tool schemas for the domain layer', () => {
    const click = createTools(args).find(tool => tool.name === 'click')
    const handler = new ToolHandler(click, args, async () => undefined, new Mutex())
    expect(zodInputToJsonSchema(handler.registeredInputSchema)).toMatchObject({ type: 'object', properties: { uid: { type: 'string' }, dblClick: { type: 'boolean' } }, required: ['uid'] })
  })
})

