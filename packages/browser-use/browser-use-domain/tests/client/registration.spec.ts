import type { Context } from '@deepseek-ai/cordis'
import type { ReactElement } from 'react'
import { expect, it, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({ Button: 'button', IconFolderOpenOutline16: 'span' }))

import { apply } from '../../src/client/index.tsx'

it('keeps the remote stable across settings slot renders so drafts are not reloaded', () => {
  let render: (() => ReactElement<{ remote: unknown }>) | undefined
  const readRemote = vi.fn(() => ({ settings: {} }))
  const ctx = {
    get remote() { return readRemote() },
    slots: {
      inject: (_name: string, register: () => void) => register(),
      register: (_options: unknown, callback: typeof render) => { render = callback },
    },
  }
  apply(ctx as unknown as Context)
  const first = render!()
  const second = render!()
  expect(first.props.remote).toBe(second.props.remote)
  expect(readRemote).toHaveBeenCalledTimes(1)
})
