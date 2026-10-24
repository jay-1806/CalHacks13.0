import { describe, it, expect, vi } from 'vitest';
import { ClaudeCoDriveService, COMPUTER_TOOLSET, type CoDriveModelClient } from '../integrations/claude-codrive.js';

const screen = {
  screenshotBase64: 'data:image/jpeg;base64,AAAA',
  imageWidth: 1920,
  imageHeight: 1080,
  screenNumber: 1,
};

function clientReturning(...responses: any[]): CoDriveModelClient & { calls: any[] } {
  const calls: any[] = [];
  return {
    calls,
    beta: {
      messages: {
        create: vi.fn(async (params: any) => {
          calls.push(structuredClone(params));
          return responses.shift();
        }),
      },
    },
  };
}

const toolUse = (name: string, input: Record<string, unknown>, id = `toolu_${name}`) => ({
  type: 'tool_use',
  id,
  name,
  input,
  toolset_name: 'computer',
});

describe('ClaudeCoDriveService', () => {
  it('sends the screenshot with the computer toolset and maps clicks to normalized coordinates', async () => {
    const client = clientReturning({
      stop_reason: 'tool_use',
      content: [
        { type: 'thinking', thinking: 'Open the File menu to find Export.' },
        toolUse('left_click', { coordinate: [960, 54] }),
      ],
    });
    const service = new ClaudeCoDriveService('key', true, client);

    const [action] = await service.proposeActions('export this as PDF', screen);

    const request = client.calls[0];
    expect(request.tools).toEqual([COMPUTER_TOOLSET]);
    expect(request.messages[0].content[0].source).toEqual({ type: 'base64', media_type: 'image/jpeg', data: 'AAAA' });
    expect(action).toMatchObject({
      type: 'click',
      button: 'left',
      clickCount: 1,
      coordinates: { x: 0.5, y: 0.05 },
      screenNumber: 1,
      description: 'Open the File menu to find Export.',
      status: 'proposed',
      requiresApproval: true,
    });
  });

  it('maps type, key, double-click and scroll calls and caps proposals at three', async () => {
    const client = clientReturning({
      stop_reason: 'tool_use',
      content: [
        toolUse('double_click', { coordinate: [100, 100] }, 'a'),
        toolUse('type', { text: 'quarterly report' }, 'b'),
        toolUse('key', { text: 'ctrl+s' }, 'c'),
        toolUse('scroll', { coordinate: [10, 10], scroll_direction: 'down', scroll_amount: 5 }, 'd'),
      ],
    });
    const actions = await new ClaudeCoDriveService('key', true, client).proposeActions('save it', screen);

    expect(actions.map((a) => a.type)).toEqual(['click', 'type', 'hotkey']);
    expect(actions[0].clickCount).toBe(2);
    expect(actions[1].text).toBe('quarterly report');
    expect(actions[2].text).toBe('ctrl+s');
  });

  it('answers a screenshot-only turn with the image and asks once more', async () => {
    const client = clientReturning(
      { stop_reason: 'tool_use', content: [toolUse('screenshot', {})] },
      { stop_reason: 'tool_use', content: [toolUse('left_click', { coordinate: [0, 0] })] }
    );
    const actions = await new ClaudeCoDriveService('key', true, client).proposeActions('click', screen);

    expect(actions[0].type).toBe('click');
    const followUp = client.calls[1].messages[2].content[0];
    expect(followUp).toMatchObject({ type: 'tool_result', tool_use_id: 'toolu_screenshot', toolset_name: 'computer' });
    expect(followUp.content[0].type).toBe('image');
  });

  it('blocks unsafe steps through the shared safety rules', async () => {
    const client = clientReturning({
      stop_reason: 'tool_use',
      content: [{ type: 'text', text: 'Type the password into the login box.' }, toolUse('type', { text: 'hunter2' })],
    });
    const [action] = await new ClaudeCoDriveService('key', true, client).proposeActions('log in', screen);
    expect(action.status).toBe('blocked');
  });

  it('refuses to plan without a screenshot', async () => {
    const client = clientReturning();
    const [action] = await new ClaudeCoDriveService('key', true, client).proposeActions('click next', {});
    expect(action.status).toBe('blocked');
    expect(client.calls).toHaveLength(0);
  });

  it('hands approved actions to the desktop only when desktop control is enabled', async () => {
    const response = { stop_reason: 'tool_use', content: [toolUse('left_click', { coordinate: [5, 5] })] };

    const off = new ClaudeCoDriveService('key', false, clientReturning(response));
    const [offAction] = await off.proposeActions('click', screen);
    const offResult = await off.executeApprovedAction(offAction.id);
    expect(offResult.success).toBe(false);
    expect(offResult.action).toBeUndefined();

    const on = new ClaudeCoDriveService('key', true, clientReturning(response));
    const [onAction] = await on.proposeActions('click', screen);
    const onResult = await on.executeApprovedAction(onAction.id);
    expect(onResult.success).toBe(true);
    expect(onResult.action?.status).toBe('approved');
    expect((await on.executeApprovedAction(onAction.id)).success).toBe(false); // single use
  });
});
