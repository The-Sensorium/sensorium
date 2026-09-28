import { describe, expect, it, vi, afterEach } from 'vitest'
import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { MemberCardMenu } from './MemberCardMenu'

vi.mock('./MuteButton', () => ({
  MuteButton: ({ targetName }: { targetName: string }) => (
    <button type="button" role="menuitem">
      Mute {targetName}
    </button>
  ),
}))

const member = { id: 'm1', display_name: 'Bo' }

function renderMenu(props?: Partial<Parameters<typeof MemberCardMenu>[0]>) {
  return render(
    <MemoryRouter>
      <MemberCardMenu
        member={member}
        clusterId="c1"
        isSelf={false}
        open={false}
        onOpen={vi.fn()}
        onClose={vi.fn()}
        onReport={vi.fn()}
        {...props}
      />
    </MemoryRouter>,
  )
}

function renderOpenableMenu() {
  function Harness() {
    const [open, setOpen] = useState(false)
    return (
      <MemoryRouter>
        <MemberCardMenu
          member={member}
          clusterId="c1"
          isSelf={false}
          open={open}
          onOpen={() => setOpen(true)}
          onClose={() => setOpen(false)}
          onReport={vi.fn()}
        />
      </MemoryRouter>
    )
  }
  return render(<Harness />)
}

describe('MemberCardMenu', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })
  it('renders only the options button when closed', () => {
    renderMenu()
    expect(screen.getByRole('button', { name: 'Member options for Bo' })).toBeInTheDocument()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('opens the popover on click', () => {
    const onOpen = vi.fn()
    renderMenu({ onOpen })
    fireEvent.click(screen.getByRole('button', { name: 'Member options for Bo' }))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('shows view profile, mute, and report when open', () => {
    renderMenu({ open: true })
    expect(screen.getByRole('menuitem', { name: 'View profile' })).toHaveAttribute(
      'href',
      '/profile/m1?cluster=c1',
    )
    expect(screen.getByRole('menuitem', { name: 'Mute Bo' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Report' })).toBeInTheDocument()
  })

  it('shows only view profile for the member themselves', () => {
    renderMenu({ open: true, isSelf: true })
    expect(screen.getByRole('menuitem', { name: 'View profile' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Mute Bo' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Report' })).not.toBeInTheDocument()
  })

  it('reports and closes when report is selected', () => {
    const onReport = vi.fn()
    const onClose = vi.fn()
    renderMenu({ open: true, onReport, onClose })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Report' }))
    expect(onReport).toHaveBeenCalledTimes(1)
  })

  it('closes when tapping outside the menu', () => {
    const onClose = vi.fn()
    renderMenu({ open: true, onClose })
    fireEvent.click(screen.getByRole('button', { name: 'Close member menu' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape when open', () => {
    const onClose = vi.fn()
    renderMenu({ open: true, onClose })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ignores Escape when closed', () => {
    const onClose = vi.fn()
    renderMenu({ open: false, onClose })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('opens below the trigger when there is room underneath', () => {
    vi.spyOn(HTMLDivElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 300,
      bottom: 344,
      left: 0,
      right: 0,
      width: 44,
      height: 44,
      x: 0,
      y: 300,
      toJSON: () => ({}),
    } as DOMRect)
    renderOpenableMenu()
    fireEvent.click(screen.getByRole('button', { name: 'Member options for Bo' }))
    const menu = screen.getByRole('menu')
    expect(menu.className).toContain('top-full')
    expect(menu.className).not.toContain('bottom-full')
  })

  it('flips above only when the menu would not fit below', () => {
    vi.spyOn(HTMLDivElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 700,
      bottom: 744,
      left: 0,
      right: 0,
      width: 44,
      height: 44,
      x: 0,
      y: 700,
      toJSON: () => ({}),
    } as DOMRect)
    renderOpenableMenu()
    fireEvent.click(screen.getByRole('button', { name: 'Member options for Bo' }))
    const menu = screen.getByRole('menu')
    expect(menu.className).toContain('bottom-full')
    expect(menu.className).not.toContain('top-full')
  })
})
