import type { MessageResponse } from '@/api/types'

const FNV_64_OFFSET_BASIS = 0xcbf29ce484222325n
const FNV_64_PRIME = 0x100000001b3n

function historyMessageSignature(message: MessageResponse): string {
  return JSON.stringify([
    message.role,
    message.content,
    message.timestamp,
    message.generation_id ?? null,
    message.interrupted ?? false,
    message.interrupt_reason ?? null,
    message.name ?? null
  ])
}

function fnv1a64(value: string): string {
  let hash = FNV_64_OFFSET_BASIS
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index))
    hash = BigInt.asUintN(64, hash * FNV_64_PRIME)
  }
  return hash.toString(36)
}

/**
 * Produces deterministic client IDs while the history API has no message ID.
 * Duplicate occurrences are counted from the newest edge so prepending older
 * history cannot renumber message objects that are already mounted.
 */
export function createStableHistoryMessageIds(
  chatId: string,
  messages: readonly MessageResponse[]
): string[] {
  const ids = new Array<string>(messages.length)
  const occurrencesFromNewest = new Map<string, number>()

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (!message) {
      continue
    }

    const signature = historyMessageSignature(message)
    const occurrence = (occurrencesFromNewest.get(signature) ?? 0) + 1
    occurrencesFromNewest.set(signature, occurrence)
    const digest = fnv1a64(`${chatId}\0${signature}`)
    ids[index] = `history_${digest}_${occurrence}`
  }

  return ids
}
