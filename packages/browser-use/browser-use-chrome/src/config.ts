import z from '@deepseek-ai/schemastery'
export interface Config { toolCallTimeoutMs: number }
export const Config: z<Config> = z.object({ toolCallTimeoutMs: z.number().min(1).default(120_000) })
