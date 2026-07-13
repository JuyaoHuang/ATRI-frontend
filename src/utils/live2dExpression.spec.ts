import { describe, expect, it } from 'vitest'

import { extractLive2dExpression } from '@/utils/live2dExpression'

describe('Live2D expression extraction', () => {
  it('removes expression metadata before preserving the remaining Markdown source', () => {
    const source = '[expression: happy]\n**answer** with $a_x=b$'

    expect(extractLive2dExpression(source)).toEqual({
      expression: 'happy',
      content: '**answer** with $a_x=b$'
    })
  })
})
