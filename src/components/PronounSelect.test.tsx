import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PronounSelect } from './PronounSelect'

describe('PronounSelect', () => {
  it('shows "Don’t share" for an empty value', () => {
    render(<PronounSelect value="" onChange={() => {}} />)
    expect(screen.getByLabelText('Pronouns')).toHaveValue('')
  })

  it('selects the preset that matches the current value', () => {
    render(<PronounSelect value="she/her" onChange={() => {}} />)
    expect(screen.getByLabelText('Pronouns')).toHaveValue('she/her')
  })

  it('emits the preset when one is chosen', () => {
    const onChange = vi.fn()
    render(<PronounSelect value="" onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Pronouns'), { target: { value: 'they/them' } })
    expect(onChange).toHaveBeenCalledWith('they/them')
  })

  it('reveals the custom field and emits free text when "Something else" is chosen', () => {
    const onChange = vi.fn()
    render(<PronounSelect value="" onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Pronouns'), { target: { value: '__custom__' } })
    const custom = screen.getByLabelText('Custom pronouns')
    expect(custom).toBeInTheDocument()
    fireEvent.change(custom, { target: { value: 'ze/zir' } })
    expect(onChange).toHaveBeenLastCalledWith('ze/zir')
  })

  it('shows the custom field populated for a non-preset value', () => {
    render(<PronounSelect value="ze/zir" onChange={() => {}} />)
    expect(screen.getByLabelText('Pronouns')).toHaveValue('__custom__')
    expect(screen.getByLabelText('Custom pronouns')).toHaveValue('ze/zir')
  })

  it('clears the value when "Don’t share" is chosen', () => {
    const onChange = vi.fn()
    render(<PronounSelect value="he/him" onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Pronouns'), { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith('')
  })
})
