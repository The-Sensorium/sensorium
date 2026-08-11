import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StepReview } from './step-review'
import { EMPTY_DRAFT } from './draft'

function reviewDraft(overrides: Record<string, string>) {
  return { ...EMPTY_DRAFT, ...overrides }
}

describe('StepReview', () => {
  it('shows the chosen pronouns in the summary', () => {
    render(<StepReview draft={reviewDraft({ displayName: 'Diya', pronouns: 'they/them', dob: '1996-07-12', countryCode: 'PT' })} />)
    expect(screen.getByText('they/them')).toBeInTheDocument()
  })

  it('omits the pronouns row when none were chosen', () => {
    render(<StepReview draft={reviewDraft({ displayName: 'Diya', dob: '1996-07-12', countryCode: 'PT' })} />)
    expect(screen.queryByText('Pronouns')).not.toBeInTheDocument()
  })
})
