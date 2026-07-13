import { describe, expect, it, vi } from 'vitest'

import { setLive2dCoreParameter } from './coreParameterAdapter'

describe('setLive2dCoreParameter', () => {
  it('uses Cubism 3/4 parameter IDs with the modern core API', () => {
    const setParameterValueById = vi.fn()

    expect(setLive2dCoreParameter({ setParameterValueById }, 'ParamAngleX', 12)).toBe(true)
    expect(setParameterValueById).toHaveBeenCalledWith('ParamAngleX', 12)
  })

  it('maps parameter IDs for the Cubism 2 core API', () => {
    const setParamFloat = vi.fn()

    expect(setLive2dCoreParameter({ setParamFloat }, 'ParamEyeBallX', 0.5)).toBe(true)
    expect(setParamFloat).toHaveBeenCalledWith('PARAM_EYE_BALL_X', 0.5)
  })

  it('passes through model-specific Cubism 2 parameter IDs', () => {
    const setParamFloat = vi.fn()

    expect(setLive2dCoreParameter({ setParamFloat }, 'CUSTOM_PARAM', 1)).toBe(true)
    expect(setParamFloat).toHaveBeenCalledWith('CUSTOM_PARAM', 1)
  })

  it('returns false for an unsupported core model', () => {
    expect(setLive2dCoreParameter({}, 'ParamAngleX', 1)).toBe(false)
  })
})
