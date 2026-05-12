import { useAssistantStore } from '@/store/assistant-store';
import { AssistantWithQuality } from '@/types/assistant';

const mockAssistant: AssistantWithQuality = {
  id: 1, clubId: 1, saveId: 1, role: 'squad', name: 'Alan',
  age: 45, archetype: 'analytics', seasonsAtClub: 2,
  retirementAge: 65, wagePerMonth: 8000, willRetireNextSeason: false, qualityStars: 2,
};

beforeEach(() => {
  useAssistantStore.getState().reset();
});

describe('assistant-store', () => {
  it('initial state has empty assistants and no comment', () => {
    const state = useAssistantStore.getState();
    expect(state.assistants).toHaveLength(0);
    expect(state.pendingComment).toBeNull();
    expect(state.lastCommentWeek).toBe(-1);
  });

  it('setAssistants replaces the array', () => {
    useAssistantStore.getState().setAssistants([mockAssistant]);
    expect(useAssistantStore.getState().assistants).toHaveLength(1);
    expect(useAssistantStore.getState().assistants[0].name).toBe('Alan');
  });

  it('setPendingComment stores the comment', () => {
    const comment = { assistantId: 1, assistantName: 'Alan', archetype: 'analytics' as const, role: 'squad' as const, text: 'Hello' };
    useAssistantStore.getState().setPendingComment(comment);
    expect(useAssistantStore.getState().pendingComment?.text).toBe('Hello');
  });

  it('setPendingComment(null) clears the comment', () => {
    const comment = { assistantId: 1, assistantName: 'Alan', archetype: 'analytics' as const, role: 'squad' as const, text: 'Hello' };
    useAssistantStore.getState().setPendingComment(comment);
    useAssistantStore.getState().setPendingComment(null);
    expect(useAssistantStore.getState().pendingComment).toBeNull();
  });

  it('setLastCommentWeek stores the week', () => {
    useAssistantStore.getState().setLastCommentWeek(10);
    expect(useAssistantStore.getState().lastCommentWeek).toBe(10);
  });

  it('reset returns to initialState', () => {
    useAssistantStore.getState().setAssistants([mockAssistant]);
    useAssistantStore.getState().setLastCommentWeek(10);
    useAssistantStore.getState().reset();
    const state = useAssistantStore.getState();
    expect(state.assistants).toHaveLength(0);
    expect(state.pendingComment).toBeNull();
    expect(state.lastCommentWeek).toBe(-1);
  });
});
