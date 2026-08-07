import { describe, expect, it } from 'vitest'
import { parseKlipyResults } from './gifs'

describe('parseKlipyResults', () => {
  it('returns [] for a non-object payload', () => {
    expect(parseKlipyResults(null)).toEqual([])
    expect(parseKlipyResults('nope')).toEqual([])
    expect(parseKlipyResults({})).toEqual([])
  })

  it('extracts id, title, url, thumb and dimensions from the real nested shape', () => {
    const out = parseKlipyResults({
      result: true,
      data: {
        data: [
          {
            id: 8041071659142944,
            slug: 'hello-hi-662',
            title: 'Hello',
            file: {
              md: { gif: { url: 'https://x/md.gif', width: 498, height: 498 } },
              sm: { webp: { url: 'https://x/sm.webp', width: 220, height: 220 } },
            },
          },
        ],
      },
    })
    expect(out).toHaveLength(1)
    expect(out[0]).toEqual({
      id: 'hello-hi-662',
      title: 'Hello',
      url: 'https://x/md.gif',
      thumb: 'https://x/sm.webp',
      width: 498,
      height: 498,
    })
  })

  it('also accepts a top-level array payload', () => {
    const out = parseKlipyResults({
      data: [
        {
          id: 1,
          slug: 'wave',
          file: { md: { gif: { url: 'https://x/wave.gif' } }, sm: { gif: { url: 'https://x/wave-sm.gif' } } },
        },
      ],
    })
    expect(out[0]?.id).toBe('wave')
  })

  it('falls back to id when slug is missing and falls back across formats', () => {
    const out = parseKlipyResults({
      data: {
        data: [
          {
            id: 42,
            file: {
              hd: { gif: { url: 'https://x/hd.gif', width: 640, height: 360 } },
              sm: { gif: { url: 'https://x/sm.gif' } },
            },
          },
        ],
      },
    })
    expect(out[0]?.id).toBe('42')
    expect(out[0]?.url).toBe('https://x/hd.gif')
    expect(out[0]?.thumb).toBe('https://x/sm.gif')
  })

  it('defaults missing dimensions to 480', () => {
    const [g] = parseKlipyResults({
      data: {
        data: [{ id: 'x', file: { md: { gif: { url: 'https://x.gif' } } } }],
      },
    })
    expect(g?.width).toBe(480)
    expect(g?.height).toBe(480)
  })

  it('skips entries without a usable url', () => {
    const out = parseKlipyResults({
      data: {
        data: [
          { id: 'ok', file: { md: { gif: { url: 'https://ok.gif' } } } },
          { id: 'empty', file: { md: { gif: { url: '' } } } },
          { id: 'no-file' },
        ],
      },
    })
    expect(out.map((g) => g.id)).toEqual(['ok'])
  })
})