// Checklist bodies as `apps/api`'s `checklistView` serves them, shared by this feature's two
// suites. Written out in full rather than partially, because a fixture that omits a field the
// page reads passes a validator that has the same blind spot the page does.

/** The regulatory half of a row: what `planContext` carries through from the plan item. */
export const planContext = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  ruleIds: ["SAPO-STREET-MEDIUM-001"],
  permitName: "Street Activity Permit",
  agency: "SAPO",
  kind: "permit",
  disposition: "required",
  deadline: { type: "days_before_event" },
  deadlineDisplay: "apply at least 30 days before the event",
  latestApplyDate: "2026-08-01",
  applyAfterDate: null,
  deadlineStatus: "on_track",
  slackDays: 12,
  deadlineUnknownFields: [],
  timelineUnresolvedReason: null,
  verificationStatus: "SOURCE_CONFIRMED",
  lastVerifiedDate: "2026-07-01",
  publishedNotes: [],
  noteText: null,
  conflictText: null,
  feeDisplay: "$25",
  portalName: "NYC SAPO portal",
  portalUrl: "https://nyc.gov/sapo",
  portalInstructions: null,
  sources: [
    {
      ruleId: "SAPO-STREET-MEDIUM-001",
      citation: "SAPO rules 1-05",
      urls: ["https://nyc.gov/sapo-rules"],
    },
  ],
  sourceUrl: "https://nyc.gov/sapo-rules",
  sourcePlan: { rulesetVersion: "nyc.v2.7", snapshotDate: "2026-07-26" },
  ...overrides,
});

/** A trackable row: the organizer's state on top of that plan context. */
export const trackedItem = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  ...planContext(),
  id: "item-1",
  planItemId: "plan-item-1",
  status: "not_started",
  notes: null,
  updatedAt: "2026-07-26T09:00:00.000Z",
  inLatestPlan: true,
  documents: [],
  ...overrides,
});

export const checklistBody = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  eventId: "event-1",
  planId: "plan-2",
  rulesetVersion: "nyc.v2.7",
  snapshotDate: "2026-07-26",
  created: false,
  planChanged: false,
  planStale: false,
  statusRollup: {
    not_started: 0,
    in_progress: 0,
    submitted: 0,
    approved: 0,
    rejected: 0,
  },
  items: [],
  contextItems: [],
  ...overrides,
});
