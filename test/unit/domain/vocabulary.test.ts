import { describe, expect, it } from '@rstest/core'
import { ACTION_OUTCOMES, LOAD_OUTCOMES, LOAD_RESOURCES, ME_ACTIONS, UPLOAD_STAGES } from '../../../src/domain/events/me-events'
import * as vocabulary from '../../../src/domain/vocabulary'

describe('closed vocabularies', () => {
  it('lists the codes the User Profile and Delegation Swagger name', () => {
    expect(vocabulary.AVAILABILITY).toEqual(['available', 'busy', 'ooo'])
    expect(vocabulary.WRITING_TONES).toEqual(['formal', 'technical', 'concise', 'persuasive', 'neutral'])
    expect(vocabulary.URGENCY).toEqual(['any', 'normal', 'high', 'critical'])
    expect(vocabulary.SIGNATURE_TYPES).toEqual(['image/png', 'image/jpeg'])
    expect(vocabulary.DEPARTMENT_LEVELS).toEqual(['preparator', 'reviewer', 'approver'])
  })

  it('offers all and department delegation scopes, not tender (LLD §15 #7)', () => {
    expect(vocabulary.OFFERED_SCOPES).toEqual(['all', 'department'])
    expect(vocabulary.DELEGATION_SCOPES).toContain('tender')
  })

  it('has no duplicates in any list', () => {
    for (const [name, value] of Object.entries(vocabulary)) {
      if (Array.isArray(value)) expect(new Set(value).size, name).toBe(value.length)
    }
    for (const set of [ME_ACTIONS, ACTION_OUTCOMES, LOAD_RESOURCES, LOAD_OUTCOMES, UPLOAD_STAGES]) expect(new Set(set).size).toBe(set.length)
  })

  it('has the telemetry set sizes the metrics page budgets for', () => {
    expect(LOAD_RESOURCES).toHaveLength(10)
    expect(ME_ACTIONS).toHaveLength(11)
    expect(UPLOAD_STAGES).toHaveLength(4)
  })
})
