import { DbHandle } from '@/database/queries/players';
import { getAssistantsBySave, updateAssistantSeasonEnd, deleteAssistant } from '@/database/queries/assistants';
import { processAssistantSeasonEnd } from '@/engine/assistant/assistant-engine';
import { AssistantWithQuality } from '@/types/assistant';

/**
 * Ages every assistant of the save, retires (deletes) those past retirement age,
 * and returns the refreshed list. Pure orchestration over the DbHandle — no React.
 */
export async function processAssistantsSeasonEnd(
  db: DbHandle,
  saveId: number,
): Promise<AssistantWithQuality[]> {
  const assistants = await getAssistantsBySave(db, saveId);
  for (const assistant of assistants) {
    const result = processAssistantSeasonEnd(assistant);
    if (result.retired) {
      await deleteAssistant(db, assistant.id);
    } else {
      await updateAssistantSeasonEnd(db, assistant.id, result.newAge, result.newSeasonsAtClub, result.willRetireNextSeason);
    }
  }
  return getAssistantsBySave(db, saveId);
}
