import type { TutorInput, TutorResponse, LearnerProfile, SponsorIntegration } from '@screentutor/shared';

const API_BASE = 'http://localhost:4317';

export async function askTutor(input: TutorInput & { demoLessonId?: string }): Promise<TutorResponse> {
  const res = await fetch(`${API_BASE}/api/tutor/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });
  if (!res.ok) throw new Error(`API error: ${res.statusText}`);
  return await res.json();
}

export async function getMemory(userId: string): Promise<LearnerProfile> {
  const res = await fetch(`${API_BASE}/api/memory/${userId}`);
  if (!res.ok) throw new Error(`API error: ${res.statusText}`);
  return await res.json();
}

export async function updateMemory(userId: string, patch: Partial<LearnerProfile>): Promise<LearnerProfile> {
  const res = await fetch(`${API_BASE}/api/memory/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch)
  });
  if (!res.ok) throw new Error(`API error: ${res.statusText}`);
  return await res.json();
}

export async function clearMemory(userId: string): Promise<void> {
  await fetch(`${API_BASE}/api/memory/${userId}`, { method: 'DELETE' });
}

export async function checkHealth(): Promise<any> {
  const res = await fetch(`${API_BASE}/health`);
  return await res.json();
}

export async function getTTSStatus(): Promise<{ enabled: boolean; configured: boolean }> {
  const res = await fetch(`${API_BASE}/api/tts/status`);
  if (!res.ok) throw new Error(`API error: ${res.statusText}`);
  return await res.json();
}

export async function getSponsorStatus(): Promise<SponsorIntegration[]> {
  const res = await fetch(`${API_BASE}/api/sponsors/status`);
  if (!res.ok) throw new Error(`API error: ${res.statusText}`);
  return await res.json();
}
