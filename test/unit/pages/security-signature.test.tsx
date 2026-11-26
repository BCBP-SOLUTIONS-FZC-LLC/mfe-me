import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, rs } from '@rstest/core'
import ProfilePage from '../../../src/presentation/pages/ProfilePage'
import SecurityPage from '../../../src/presentation/pages/SecurityPage'
import { clampCropPct, cropRect, previewUrl, WHOLE } from '../../../src/presentation/pages/profile/SignatureCropper'
import { createFakeIam, problem } from '../../fixtures/fakeIam'
import { renderPage } from '../../fixtures/pages'

const user = () => userEvent.setup()
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])

describe('SecurityPage (G6)', () => {
  it('links to the account console in a new tab, safely, and states the rules', async () => {
    renderPage(<SecurityPage />)
    const link = await screen.findByRole('link', { name: /Manage sign-in/ })
    expect(link).toHaveAttribute('href', expect.stringContaining('https://idp.example/realms/tenant-acme/account/'))
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(screen.getByRole('link', { name: /Manage devices/ })).toBeInTheDocument()
    expect(screen.getByText("Multi-factor authentication can't be switched off.")).toBeInTheDocument()
    expect(screen.getByText(/24-hour wait/)).toBeInTheDocument()
    expect(screen.getByText(/everyone sets up their sign-in again/)).toBeInTheDocument()
    expect(screen.queryByText(/Trial workspaces share/)).not.toBeInTheDocument()
  })

  it('mentions the shared console for a trial workspace', async () => {
    const { services } = renderPage(<SecurityPage />, { services: { navigation: { toAdminSettings: () => {}, accountConsoleUrl: () => 'https://idp.example/realms/trial/account/', isSharedConsole: () => true } } })
    expect(services).toBeDefined()
    expect(await screen.findByText(/Trial workspaces share one account console/)).toBeInTheDocument()
  })

  it('says the console is not available when there is no URL', async () => {
    renderPage(<SecurityPage />, { services: { navigation: { toAdminSettings: () => {}, accountConsoleUrl: () => undefined, isSharedConsole: () => false } } })
    expect(await screen.findAllByText("The account console isn't available from here.")).toHaveLength(2)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})

describe('cropping', () => {
  it('is the whole image until something is changed, and gives whole pixels otherwise', () => {
    expect(cropRect(WHOLE, 200, 100)).toBeUndefined()
    expect(cropRect({ left: 10, top: 20, width: 50, height: 40 }, 200, 100)).toEqual({ x: 20, y: 20, width: 100, height: 40 })
    expect(cropRect({ left: 0, top: 0, width: 1, height: 1 }, 10, 10)).toEqual({ x: 0, y: 0, width: 1, height: 1 })
  })
  it('keeps a crop inside the image', () => {
    expect(clampCropPct({ left: 80, top: 0, width: 100, height: 100 })).toEqual({ left: 80, top: 0, width: 20, height: 100 })
    expect(clampCropPct({ left: -5, top: 120, width: 0, height: 0 })).toEqual({ left: 0, top: 99, width: 1, height: 1 })
  })
})

describe('the preview', () => {
  it('is a data: URL, because the platform CSP allows no blob: images', () => {
    expect(previewUrl(Uint8Array.from([1, 2, 3]), 'image/png')).toBe('data:image/png;base64,AQID')
    expect(previewUrl(new Uint8Array(70_000), 'image/png').startsWith('data:image/png;base64,')).toBe(true)
  })
})

describe('SignatureCard (G1)', () => {
  it('shows the picked image as a data URL, never a blob: one', async () => {
    renderPage(<ProfilePage />, { services: { images: { toPng: async () => PNG }, hasher: { sha256Hex: async () => 'a'.repeat(64) } } })
    const input = (await screen.findByLabelText('Upload a signature')) as HTMLInputElement
    await userEvent.setup().upload(input, new File([PNG as BlobPart], 'sig.png', { type: 'image/png' }))
    expect((await screen.findByRole('img', { name: 'Preview of the picked signature' })).getAttribute('src')).toMatch(/^data:image\/png;base64,/)
  })

  it('says so when the picked file cannot be read', async () => {
    renderPage(<ProfilePage />)
    const input = (await screen.findByLabelText('Upload a signature')) as HTMLInputElement
    const broken = new File([PNG as BlobPart], 'sig.png', { type: 'image/png' })
    Object.defineProperty(broken, 'arrayBuffer', { value: async () => Promise.reject(new Error('gone')) })
    fireEvent.change(input, { target: { files: [broken] } })
    expect(await screen.findByText("We couldn't read that file. Pick it again.")).toBeInTheDocument()
  })

  const file = (bytes: Uint8Array = PNG, type = 'image/png', name = 'sig.png') => new File([bytes as BlobPart], name, { type })
  const services = () => ({
    images: { toPng: async () => PNG },
    hasher: { sha256Hex: async () => 'a'.repeat(64) },
  })
  const upload = async (f: File) => {
    const input = (await screen.findByLabelText('Upload a signature')) as HTMLInputElement
    await user().upload(input, f)
  }

  it('hides Upload where no storage origin is configured', async () => {
    renderPage(<ProfilePage />, { services: { options: { allowedModels: [], notificationEventTypes: [], enabledLocales: ['en'], uploadOrigins: [], timeZones: [] } } })
    expect(await screen.findByText("Signature upload isn't available in this environment.")).toBeInTheDocument()
    expect(screen.queryByLabelText('Upload a signature')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove signature' })).toBeInTheDocument()
  })

  it('uploads: presign, put, confirm, then says it was saved; the URL is never shown', async () => {
    const { iam, recorded } = renderPage(<ProfilePage />, { services: services() })
    await upload(file())
    expect(await screen.findByRole('img', { name: 'Preview of the picked signature' })).toBeInTheDocument()
    await user().click(screen.getByRole('button', { name: 'Save signature' }))
    expect(await screen.findByText(/Signature saved/)).toBeInTheDocument()
    expect(iam.calls.filter((c) => /presign|storage|confirm/.test(c))).toEqual(['presignSignature', 'storage.put', 'confirmSignature'])
    expect(iam.bodies['confirmSignature']).toEqual([{ objectKey: expect.stringContaining('/signatures/'), sha256: 'a'.repeat(64) }])
    expect(recorded.actions).toEqual([{ action: 'upload_signature', outcome: 'success' }])
    expect(document.body.textContent).not.toContain('SECRET')
    expect(screen.queryByRole('img', { name: 'Preview of the picked signature' })).not.toBeInTheDocument()
  })

  it('crops: moving a slider changes the part to keep, and the whole image is kept otherwise', async () => {
    renderPage(<ProfilePage />, { services: services() })
    await upload(file())
    const left = await screen.findByLabelText('From the left')
    fireEvent.change(left, { target: { value: '30' } })
    expect(left).toHaveValue('30')
    expect(left).toHaveAttribute('aria-valuetext', '30 percent')
    fireEvent.change(screen.getByLabelText('Width'), { target: { value: '90' } })
    expect(screen.getByLabelText('Width')).toHaveValue('70') // never past the right edge
  })

  it('passes the crop in the image\'s pixels to the processor once the image has loaded', async () => {
    const toPng = rs.fn(async () => PNG)
    renderPage(<ProfilePage />, { services: { images: { toPng }, hasher: { sha256Hex: async () => 'a'.repeat(64) } } })
    await upload(file())
    const img = await screen.findByRole('img', { name: 'Preview of the picked signature' })
    Object.defineProperty(img, 'naturalWidth', { value: 200 })
    Object.defineProperty(img, 'naturalHeight', { value: 100 })
    fireEvent.load(img)
    fireEvent.change(screen.getByLabelText('From the left'), { target: { value: '50' } })
    await user().click(screen.getByRole('button', { name: 'Save signature' }))
    await screen.findByText(/Signature saved/)
    expect(toPng).toHaveBeenCalledWith(expect.anything(), { x: 100, y: 0, width: 100, height: 100 }, undefined)
  })

  it.each([
    ['a GIF', file(Uint8Array.from([0x47, 0x49, 0x46, 0x38]), 'image/gif', 'sig.gif'), 'Pick a PNG or JPEG image.'],
    ['a file whose bytes are not what its type says', file(Uint8Array.from([1, 2, 3, 4]), 'image/png'), 'Pick a PNG or JPEG image.'],
    ['an empty file', file(new Uint8Array(), 'image/png'), 'Pick a PNG or JPEG image.'],
  ])('refuses %s before any request', async (_n, f, message) => {
    const { iam } = renderPage(<ProfilePage />, { services: services() })
    const input = (await screen.findByLabelText('Upload a signature')) as HTMLInputElement
    fireEvent.change(input, { target: { files: [f] } })
    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(iam.calls).not.toContain('presignSignature')
    expect(screen.queryByRole('button', { name: 'Save signature' })).not.toBeInTheDocument()
  })

  it('refuses a file over 1 MB', async () => {
    const big = new Uint8Array(1_048_577)
    big.set(PNG)
    renderPage(<ProfilePage />, { services: services() })
    const input = (await screen.findByLabelText('Upload a signature')) as HTMLInputElement
    fireEvent.change(input, { target: { files: [file(big)] } })
    expect(await screen.findByText('The file is larger than 1 MB.')).toBeInTheDocument()
  })

  it('picking nothing clears the preview', async () => {
    renderPage(<ProfilePage />, { services: services() })
    await upload(file())
    await screen.findByRole('img', { name: 'Preview of the picked signature' })
    fireEvent.change(screen.getByLabelText('Upload a signature'), { target: { files: [] } })
    await waitFor(() => expect(screen.queryByRole('img', { name: 'Preview of the picked signature' })).not.toBeInTheDocument())
  })

  it.each([
    ['presign', 'presignSignature', problem(409, 'SIGNATURE_ERASURE_PENDING'), 'Your previous signature is still being removed. Try again in a minute.'],
    ['presign (rate limited)', 'presignSignature', problem(429, 'RATE_LIMITED'), 'Too many uploads. Try again shortly.'],
    ['presign (service down)', 'presignSignature', problem(503, 'USER_PROFILE_UNAVAILABLE'), 'Nothing was changed. Try again.'],
    ['confirm (too large)', 'confirmSignature', problem(413, 'PAYLOAD_TOO_LARGE'), 'The file is larger than 1 MB.'],
    ['confirm (mismatch)', 'confirmSignature', problem(422, 'VALIDATION_FAILED'), "The upload didn't match. Try again."],
    ['confirm (erasure pending)', 'confirmSignature', problem(409, 'SIGNATURE_ERASURE_PENDING'), 'Your previous signature is still being removed. Try again in a minute.'],
    ['storage', 'storage.put', new Error('403'), "We couldn't upload your signature. Nothing was changed. Try again."],
  ])('says what happened when the %s step fails', async (_n, method, error, message) => {
    const iam = createFakeIam()
    iam.failNext(method, error)
    renderPage(<ProfilePage />, { iam, services: services() })
    await upload(file())
    await user().click(await screen.findByRole('button', { name: 'Save signature' }))
    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(screen.queryByText(/Signature saved/)).not.toBeInTheDocument()
  })

  it('says so when the image cannot be prepared', async () => {
    renderPage(<ProfilePage />, { services: { images: { toPng: async () => Promise.reject(new Error('decode')) }, hasher: { sha256Hex: async () => 'a'.repeat(64) } } })
    await upload(file())
    await user().click(await screen.findByRole('button', { name: 'Save signature' }))
    expect(await screen.findByText("We couldn't upload your signature. Nothing was changed. Try again.")).toBeInTheDocument()
  })

  it('refuses the re-encoded image when it is over 1 MB', async () => {
    const huge = new Uint8Array(1_048_577)
    huge.set(PNG)
    renderPage(<ProfilePage />, { services: { images: { toPng: async () => huge }, hasher: { sha256Hex: async () => 'a'.repeat(64) } } })
    await upload(file())
    await user().click(await screen.findByRole('button', { name: 'Save signature' }))
    expect(await screen.findByText('The file is larger than 1 MB.')).toBeInTheDocument()
  })

  it('asks before removing, and removing says approvals will need a new one', async () => {
    const { iam, recorded } = renderPage(<ProfilePage />, { services: services() })
    await user().click(await screen.findByRole('button', { name: 'Remove signature' }))
    const dialog = await screen.findByRole('dialog', { name: 'Remove your signature?' })
    expect(within(dialog).getByText('Approvals will need a new signature.')).toBeInTheDocument()
    await user().click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(iam.calls).not.toContain('deleteSignature')
    await user().click(screen.getByRole('button', { name: 'Remove signature' }))
    await user().click(within(await screen.findByRole('dialog', { name: 'Remove your signature?' })).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(iam.calls).toContain('deleteSignature')
    expect(recorded.actions).toEqual([{ action: 'remove_signature', outcome: 'success' }])
  })

  it('shows a failed removal in the dialog and forgets "saved" after a removal', async () => {
    const iam = createFakeIam()
    iam.failNext('deleteSignature', problem(503, 'DB_UNAVAILABLE'))
    renderPage(<ProfilePage />, { iam, services: services() })
    await upload(file())
    await user().click(await screen.findByRole('button', { name: 'Save signature' }))
    await screen.findByText(/Signature saved/)
    await user().click(screen.getByRole('button', { name: 'Remove signature' }))
    const dialog = await screen.findByRole('dialog')
    await user().click(within(dialog).getByRole('button', { name: 'Remove' }))
    expect(await within(dialog).findByText('Nothing was changed. Try again.')).toBeInTheDocument()
    await user().click(within(dialog).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(screen.queryByText(/Signature saved/)).not.toBeInTheDocument())
  })

  it('a new upload right after a removal is refused while the erasure is pending', async () => {
    const iam = createFakeIam()
    renderPage(<ProfilePage />, { iam, services: services() })
    await user().click(await screen.findByRole('button', { name: 'Remove signature' }))
    await user().click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await upload(file())
    await user().click(await screen.findByRole('button', { name: 'Save signature' }))
    expect(await screen.findByText('Your previous signature is still being removed. Try again in a minute.')).toBeInTheDocument()
  })

  it('disables the card in a read-only workspace', async () => {
    renderPage(<ProfilePage />, { readOnly: true, services: services() })
    expect(await screen.findByLabelText('Upload a signature')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remove signature' })).toBeDisabled()
  })
})
