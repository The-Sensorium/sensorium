import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MessageGif } from './MessageGif'

describe('MessageGif', () => {
  it('opens a full-size preview when the thumbnail is clicked', async () => {
    render(<MessageGif src="https://cdn.example/large.gif" />)
    await userEvent.click(screen.getByRole('button', { name: 'View image full size' }))
    expect(screen.getByRole('dialog', { name: 'Image preview' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Close preview' }))
    expect(screen.queryByRole('dialog', { name: 'Image preview' })).not.toBeInTheDocument()
  })
})
