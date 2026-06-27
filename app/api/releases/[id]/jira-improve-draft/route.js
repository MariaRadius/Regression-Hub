import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getTeamSettings } from '@/lib/db/settingsData';
import { ApiError } from '@/lib/errors';
import { checkRateLimit } from '@/lib/rateLimit';
import { improveJiraIssueDraft, isAiConfigured } from '@/lib/server/aiClient';
import { withTeam } from '@/lib/server/withTeam';

const bodySchema = z.object({
  summary: z.string().min(1, 'summary is required'),
  description: z.string().min(1, 'description is required'),
});

/**
 * POST /api/releases/[id]/jira-improve-draft
 *
 * Uses the team's configured AI provider to rewrite a Jira issue draft
 * (summary + description) for clarity. Returns the improved text; the client
 * replaces the edit-fields and lets the QA review before creating the issue.
 *
 * Open to admin and QA (withTeam). Rate-limited to 30 req/min per user.
 */
export const POST = withTeam(async (request, _ctx, { teamId, db, session }) => {
  const rl = checkRateLimit(`jira:improve:${session.user.id}`, 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many requests — slow down' },
      { status: 429 },
    );
  }

  const body = await request.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0]?.message || 'Invalid body');
  }

  const settings = await getTeamSettings(db, teamId);
  if (!isAiConfigured(settings)) {
    throw new ApiError(
      503,
      'AI provider is not configured — add one in Admin → AI Generation',
    );
  }

  const improved = await improveJiraIssueDraft(
    { aiProvider: settings.aiProvider, aiApiKey: settings.aiApiKey },
    { summary: parsed.data.summary, description: parsed.data.description },
  );

  return NextResponse.json(improved);
});
