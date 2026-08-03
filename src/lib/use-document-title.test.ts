import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useDocumentTitle } from './use-document-title'

describe('useDocumentTitle', () => {
  it('sets the document title with the brand suffix', () => {
    renderHook(() => useDocumentTitle('My Cluster'))
    expect(document.title).toBe('My Cluster | Sensorium')
  })

  it('falls back to the bare brand when the title is empty', () => {
    renderHook(() => useDocumentTitle(''))
    expect(document.title).toBe('Sensorium')
  })

  it('updates when the title changes', () => {
    const { rerender } = renderHook(({ t }: { t: string }) => useDocumentTitle(t), {
      initialProps: { t: 'One' },
    })
    expect(document.title).toBe('One | Sensorium')
    rerender({ t: 'Two' })
    expect(document.title).toBe('Two | Sensorium')
  })
})