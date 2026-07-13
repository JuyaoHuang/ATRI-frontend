import { describe, expect, it, vi } from 'vitest'

import { selectLive2dClickMotion } from './motionController'

describe('selectLive2dClickMotion', () => {
  it('prefers Body semantic groups in the documented order', () => {
    const random = vi.fn(() => 0.75)
    const definitions = {
      tap_body: [{ File: 'motions/snake.motion3.json' }],
      TapBody: [{ File: 'motions/compact.motion3.json' }],
      'Tap@Body': [
        { File: 'motions/body-a.motion3.json' },
        { File: 'motions/body-b.motion3.json' },
      ],
      '': [{ File: 'motions/fallback.motion3.json' }],
    }

    expect(selectLive2dClickMotion(definitions, ['body'], random)).toEqual({
      group: 'Tap@Body',
      index: 1,
    })
    expect(random).toHaveBeenCalledOnce()
  })

  it('supports the corresponding Head semantic groups case-insensitively', () => {
    expect(selectLive2dClickMotion({
      tap_head: [{ file: 'mtn/TAP_HEAD.mtn' }],
    }, ['HEAD'], () => 0)).toEqual({
      group: 'tap_head',
      index: 0,
    })
  })

  it('falls back to a random motion from the legal empty group', () => {
    expect(selectLive2dClickMotion({
      Idle: [{ File: 'motions/idle.motion3.json' }],
      '': [
        { file: 'mtn/I_FUN.mtn' },
        { file: 'mtn/I_SAD.mtn' },
      ],
      Wave: [{ File: 'motions/wave.motion3.json' }],
    }, ['Body'], () => 0.99)).toEqual({
      group: '',
      index: 1,
    })
  })

  it('falls back to a non-idle motion when semantic and empty groups are unavailable', () => {
    expect(selectLive2dClickMotion({
      IDLING: [{ file: 'mtn/IDLING_01.mtn' }],
      Wave: [{ File: 'motions/wave.motion3.json' }],
      Nod: [{ File: 'motions/nod.motion3.json' }],
    }, ['Body'], () => 0.8)).toEqual({
      group: 'Nod',
      index: 0,
    })
  })

  it('returns null when a model has no semantic, empty-group, or non-idle motion', () => {
    const random = vi.fn(() => 0)

    expect(selectLive2dClickMotion({
      Idle: [{ File: 'motions/idle.motion3.json' }],
      Broken: [{}],
    }, ['Body'], random)).toBeNull()
    expect(random).not.toHaveBeenCalled()
  })
})
