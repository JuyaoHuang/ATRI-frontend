export interface Live2DMotionDefinition {
  File?: string
  file?: string
}

export type Live2DMotionDefinitions = Readonly<
  Partial<Record<string, readonly Live2DMotionDefinition[] | undefined>>
>

export type Live2DRandomSource = () => number

export interface Live2DClickMotionSelection {
  group: string
  index: number
}

interface Live2DMotionCandidate extends Live2DClickMotionSelection {
  filePath: string
  isIdle: boolean
}

const CLICK_MOTION_GROUPS: Readonly<Record<string, readonly string[]>> = {
  body: ['Tap@Body', 'TapBody', 'tap_body'],
  head: ['Tap@Head', 'TapHead', 'tap_head'],
}

function getMotionFilePath(definition: Live2DMotionDefinition): string | null {
  if (typeof definition.File === 'string' && definition.File.length > 0) {
    return definition.File
  }

  if (typeof definition.file === 'string' && definition.file.length > 0) {
    return definition.file
  }

  return null
}

function isIdleMotionGroup(group: string): boolean {
  const normalizedGroup = group.trim().replace(/[\s_-]+/g, '').toLowerCase()
  return normalizedGroup === 'idle' || normalizedGroup === 'idling'
}

function getGroupMotions(
  definitions: Live2DMotionDefinitions,
  group: string,
): Live2DMotionCandidate[] {
  return (definitions[group] ?? []).flatMap((definition, index) => {
    const filePath = getMotionFilePath(definition)
    if (filePath === null) {
      return []
    }

    return [{
      group,
      index,
      filePath,
      isIdle: isIdleMotionGroup(group),
    }]
  })
}

function chooseRandomMotion(
  motions: readonly Live2DMotionCandidate[],
  random: Live2DRandomSource,
): Live2DMotionCandidate | null {
  if (motions.length === 0) {
    return null
  }

  if (motions.length === 1) {
    return motions[0] ?? null
  }

  const randomValue = random()
  const boundedValue = Number.isFinite(randomValue)
    ? Math.max(0, Math.min(randomValue, 1))
    : 0
  const index = Math.min(Math.floor(boundedValue * motions.length), motions.length - 1)
  return motions[index] ?? null
}

function findGroupName(
  definitions: Live2DMotionDefinitions,
  candidate: string,
): string | null {
  const normalizedCandidate = candidate.toLowerCase()
  return Object.keys(definitions).find(group => group.toLowerCase() === normalizedCandidate) ?? null
}

function collectUniqueMotions(
  definitions: Live2DMotionDefinitions,
): Live2DMotionCandidate[] {
  const motionsByFilePath = new Map<string, Live2DMotionCandidate>()

  for (const group of Object.keys(definitions)) {
    for (const motion of getGroupMotions(definitions, group)) {
      const existingMotion = motionsByFilePath.get(motion.filePath)
      if (existingMotion === undefined || (existingMotion.group === '' && motion.group !== '')) {
        motionsByFilePath.set(motion.filePath, motion)
      }
    }
  }

  return [...motionsByFilePath.values()]
}

export function selectLive2dClickMotion(
  definitions: Live2DMotionDefinitions,
  hitAreas: readonly string[],
  random: Live2DRandomSource = Math.random,
): Live2DClickMotionSelection | null {
  for (const hitArea of hitAreas) {
    const semanticGroups = CLICK_MOTION_GROUPS[hitArea.trim().toLowerCase()] ?? []
    for (const semanticGroup of semanticGroups) {
      const group = findGroupName(definitions, semanticGroup)
      if (group === null) {
        continue
      }

      const selectedMotion = chooseRandomMotion(getGroupMotions(definitions, group), random)
      if (selectedMotion !== null) {
        return { group: selectedMotion.group, index: selectedMotion.index }
      }
    }
  }

  const emptyGroupMotion = chooseRandomMotion(getGroupMotions(definitions, ''), random)
  if (emptyGroupMotion !== null) {
    return { group: emptyGroupMotion.group, index: emptyGroupMotion.index }
  }

  const nonIdleMotions = collectUniqueMotions(definitions)
    .filter(motion => motion.group !== '' && !motion.isIdle)
  const fallbackMotion = chooseRandomMotion(nonIdleMotions, random)
  return fallbackMotion === null
    ? null
    : { group: fallbackMotion.group, index: fallbackMotion.index }
}
