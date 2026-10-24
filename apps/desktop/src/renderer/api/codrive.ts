import type { ActionResult } from '@screentutor/shared';

const API_BASE = 'http://localhost:4317';

/**
 * Sends the user's approve/reject decision for a Co-drive card. When the server
 * approves the action for execution, the desktop app performs it locally.
 */
export async function decideCoDriveAction(
  actionId: string,
  approved: boolean
): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/api/actions/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actionId, approved }),
  });
  const data = (await res.json()) as Partial<ActionResult> & { error?: string };
  if (!res.ok) {
    return { success: false, message: data.error || `Approval failed (${res.status})` };
  }
  if (!approved || !data.action) {
    return { success: !!data.success, message: data.message || (approved ? 'Approved' : 'Rejected') };
  }
  return window.electronAPI.executeApprovedAction(data.action);
}
