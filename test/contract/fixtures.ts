// Answers as the IAM services send them (snake_case), written against the pinned Swagger: the contract
// test checks each one validates, with no field the Swagger does not declare, before an adapter reads it.
export const ME = '11111111-1111-4111-8111-111111111111'
export const OTHER = '11111111-1111-4111-8111-222222222222'
export const D1 = '22222222-2222-4222-8222-111111111111'
export const D2 = '22222222-2222-4222-8222-222222222222'
export const DLG = '44444444-4444-4444-8444-444444444444'
export const AT = '2026-11-25T10:00:00Z'

// ── User Profile ────────────────────────────────────────────────────────────────────────────────

export const userResponse = {
  id: ME,
  tenant_id: '6f1c2a9e-3b4d-4e5f-8a7b-9c0d1e2f3a4b',
  username: 'ada',
  display_name: 'Ada Lovelace',
  display_name_overridden: true,
  job_title: 'Engineer',
  job_title_overridden: false,
  email: 'ada@example.com',
  phone: '+442071838750',
  timezone: 'Europe/London',
  locale: 'en-GB',
  credentials: { cert: 'AWS-SAA', org: 'BCBP' },
  source: 'federated',
  status: 'active',
  provisional: false,
  availability: { status: 'ooo', ooo_from: '2026-12-01T00:00:00Z', ooo_until: '2026-12-10T00:00:00Z', note: 'Leave', delegate_user_id: OTHER },
  record_version: 3,
  created_at: AT,
  updated_at: AT,
}

/** The shortest valid profile: what the service answers for a person with nothing optional set. */
export const userResponseMinimal = { id: ME, display_name: 'Ada', email: 'ada@example.com', source: 'local', status: 'active', record_version: 1 }

export const batchResponse = {
  users: [userResponse, { ...userResponseMinimal, id: OTHER, availability: { status: 'busy' } }],
  missing: [D1],
  pagination: { limit: 20, total: 2 },
}

export const availabilityResponse = {
  user_id: ME,
  status: 'ooo',
  ooo_from: '2026-12-01T00:00:00Z',
  ooo_until: '2026-12-10T00:00:00Z',
  note: 'Leave',
  delegate_user_id: OTHER,
  record_version: 2,
  updated_at: AT,
}
export const availabilityBusy = { user_id: ME, status: 'busy', record_version: 3 }

export const llmPreferencesResponse = {
  preferred_model: 'model-a',
  writing_tone: 'technical',
  templates: ['Summarise in 3 bullets'],
  context_documents: ['We sell hardware in the Gulf'],
  record_version: 4,
  updated_at: AT,
}

export const notificationPreferencesResponse = {
  preferences: [
    { event_type: 'doc.approved', channels: ['email', 'in_app'], urgency_threshold: 'normal' },
    { event_type: 'doc.rejected', channels: ['push', 'carrier_pigeon'], urgency_threshold: 'any' },
  ],
}

export const presignResponse = { upload_url: 'https://bucket.example/key?X-Amz-Signature=abc', object_key: `${ME}/signatures/sig.png`, expires_in: 300 }
export const signatureConfirmResponse = { user_id: ME, signature_image_hash: 'a'.repeat(64), signature_key: `${ME}/signatures/sig.png`, updated_at: AT }

// ── Delegation ──────────────────────────────────────────────────────────────────────────────────

export const delegationResponse = {
  delegation_id: DLG,
  delegator_id: ME,
  delegate_id: OTHER,
  scope: 'department',
  scope_id: D1,
  starts_at: '2026-12-01T00:00:00Z',
  ends_at: '2026-12-20T00:00:00Z',
  status: 'scheduled',
  record_version: 5,
}
/** Open-ended: no end, reviewed on a cycle. */
export const delegationOpenEnded = {
  delegation_id: DLG,
  delegator_id: ME,
  delegate_id: OTHER,
  scope: 'all',
  starts_at: AT,
  review_due_at: '2027-02-23T10:00:00Z',
  review_window_days: 90,
  status: 'active',
  record_version: 2,
}
export const delegationList = { items: [delegationResponse, delegationOpenEnded] }
export const delegationExtended = { delegation_id: DLG, record_version: 3, review_due_at: '2027-03-25T10:00:00Z', review_last_warned_bucket: 0 }
export const delegationSettings = { max_duration_days: 90, review_window_days: 60, record_version: 1 }

// ── Org & Membership (read only) ────────────────────────────────────────────────────────────────

export const memberPage = {
  items: [
    { user_id: ME, status: 'active', tenant_roles: ['tender_admin'], departments: [{ department_id: D1, level: 'reviewer' }], record_version: 3, updated_at: AT },
    { user_id: OTHER, status: 'suspended', tenant_roles: [], departments: [], record_version: 1, updated_at: AT },
  ],
  next_cursor: 'eyJpZCI6Mn0=',
}
export const memberPageLast = { items: [memberPage.items[0]] }
export const departmentList = {
  items: [
    { department_id: D1, code: 'ENG', name: 'Engineering', is_active: true, is_system: true, record_version: 1 },
    { department_id: D2, code: 'QAQC', name: 'QA / QC', is_active: false, is_system: false, record_version: 4 },
  ],
}
export const roleLabels = {
  items: [
    { role_code: 'preparator', display_name: 'Drafter', record_version: 1 },
    { role_code: 'reviewer', display_name: 'Reviewer', record_version: 2 },
    { role_code: 'approver', display_name: 'Approver', record_version: 1 },
  ],
}
