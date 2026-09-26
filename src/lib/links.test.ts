import { parseLinks } from './links'

describe('parseLinks', () => {
  it('returns plain text untouched', () => {
    expect(parseLinks('hello world')).toEqual([{ type: 'text', value: 'hello world' }])
  })

  it('links https urls', () => {
    expect(parseLinks('see https://example.com now')).toEqual([
      { type: 'text', value: 'see ' },
      { type: 'link', value: 'https://example.com', href: 'https://example.com' },
      { type: 'text', value: ' now' },
    ])
  })

  it('prefixes www with https', () => {
    expect(parseLinks('go to www.example.com/a')).toEqual([
      { type: 'text', value: 'go to ' },
      { type: 'link', value: 'www.example.com/a', href: 'https://www.example.com/a' },
    ])
  })

  it('handles uppercase WWW', () => {
    expect(parseLinks('go to WWW.EXAMPLE.COM')).toEqual([
      { type: 'text', value: 'go to ' },
      { type: 'link', value: 'WWW.EXAMPLE.COM', href: 'https://WWW.EXAMPLE.COM' },
    ])
  })

  it('trims trailing punctuation', () => {
    const parts = parseLinks('read https://example.com/a, then (see https://example.com/b).')
    expect(parts).toEqual([
      { type: 'text', value: 'read ' },
      { type: 'link', value: 'https://example.com/a', href: 'https://example.com/a' },
      { type: 'text', value: ', then (see ' },
      { type: 'link', value: 'https://example.com/b', href: 'https://example.com/b' },
      { type: 'text', value: ').' },
    ])
  })

  it('does not link non-http schemes', () => {
    expect(parseLinks('run javascript:alert(1)')).toEqual([
      { type: 'text', value: 'run javascript:alert(1)' },
    ])
  })

  it('handles empty input', () => {
    expect(parseLinks('')).toEqual([{ type: 'text', value: '' }])
  })
})
