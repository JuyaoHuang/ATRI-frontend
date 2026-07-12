export interface ModelLoadToken {
  generation: number
  url: string | null
}

export function createModelLoadTracker() {
  let generation = 0

  return {
    begin(url: string | null): ModelLoadToken {
      generation += 1
      return { generation, url }
    },
    invalidate() {
      generation += 1
    },
    isCurrent(token: ModelLoadToken, currentUrl: string | null) {
      return token.generation === generation && token.url === currentUrl
    },
  }
}
