type ZodLike = { _def?: { typeName?: string; shape?: (() => Record<string, ZodLike>) | Record<string, ZodLike>; innerType?: ZodLike; type?: ZodLike; values?: unknown[]; value?: unknown }; description?: string; isOptional?: () => boolean }
function convert(schema: ZodLike): Record<string, unknown> {
  const def = schema._def ?? {}; const description = schema.description === undefined ? {} : { description: schema.description }
  switch (def.typeName) {
    case 'ZodString': return { type: 'string', ...description }
    case 'ZodNumber': return { type: 'number', ...description }
    case 'ZodBoolean': return { type: 'boolean', ...description }
    case 'ZodLiteral': return { const: def.value, ...description }
    case 'ZodEnum': return { type: 'string', enum: def.values, ...description }
    case 'ZodArray': return { type: 'array', items: convert(def.type ?? {}), ...description }
    case 'ZodOptional': case 'ZodDefault': return convert(def.innerType ?? {})
    case 'ZodEffects': return convert((def as { schema?: ZodLike }).schema ?? {})
    case 'ZodUnion': return { oneOf: ((def as { options?: ZodLike[] }).options ?? []).map(convert), ...description }
    case 'ZodRecord': return { type: 'object', additionalProperties: true, ...description }
    case 'ZodObject': {
      const shape = typeof def.shape === 'function' ? def.shape() : (def.shape ?? {}); const properties: Record<string, unknown> = {}; const required: string[] = []
      for (const [key, value] of Object.entries(shape)) { properties[key] = convert(value); if (value.isOptional?.() !== true) required.push(key) }
      return { type: 'object', properties, required, additionalProperties: true, ...description }
    }
    default: return {}
  }
}
export function zodInputToJsonSchema(schema: unknown): Record<string, unknown> { return convert(schema as ZodLike) }
