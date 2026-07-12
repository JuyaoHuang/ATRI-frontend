export interface Live2DModel {
  id: string
  name: string
  modelPath: string
  modelUrl: string
  thumbnailUrl?: string
  expressions: string[]
  isDefault: boolean
}

export interface Live2DPosition {
  x: number
  y: number
}

export interface Live2DExpressionRequest {
  name: string | null
  token: number
}

export interface Live2DMotion {
  motionName: string
  motionIndex: number
  fileName: string
}

export interface Live2DMotionSelection {
  group: string
  index?: number
}

export type Live2DExpressionLlmMode = 'all' | 'none' | 'custom'
