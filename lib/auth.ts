export type AmrType = "single_factor" | "multi_factor";

export type Amr = { id: string; type: AmrType };
export type Requirement = { type: AmrType; maxAge: number };
export type Acr = Record<string, Requirement[][]>;

export type User = { id: string; enrolledMeans: string[] };
export type PastAuthAction = { id: string; validatedAt: string };
export type Session = { id: string; userId: string; pastAuthenticationActions: PastAuthAction[] };

export type Model = {
  amrs: Amr[];
  acr: Acr;
  users: User[];
  sessions: Session[];
};

export type AcrCheckResult =
  | { status: "OK"; missingEnrollments: string[] }
  | { status: "authentication required"; possibleActions: string[][]; missingEnrollments: string[] };

function groupAmrsByType(amrs: Amr[]) {
  const map: Record<string, string[]> = {};
  for (const amr of amrs) {
    if (!map[amr.type]) map[amr.type] = [];
    map[amr.type].push(amr.id);
  }
  return map as Record<AmrType, string[]>;
}

function dedupeUnordered(patterns: string[][]) {
  const uniq = new Map(patterns.map((seq) => [[...seq].sort().join("|"), seq]));
  return [...uniq.values()];
}

export function isActionStillValid(
  pastAuthenticationActions: PastAuthAction[],
  amrId: string,
  maxAgeSeconds: number,
  nowMs: number
) {
  const maxAgeMs = maxAgeSeconds * 1000;

  for (const past of pastAuthenticationActions) {
    if (past.id !== amrId) continue;

    const validatedAtMs = Number(past.validatedAt);
    if (Number.isNaN(validatedAtMs)) continue;

    if (nowMs - validatedAtMs <= maxAgeMs) return true;
  }
  return false;
}

export function calcRequiredAuthentications(model: Model, requestedACR: string) {
  const options = model.acr[requestedACR];
  if (!options) throw new Error(`Unknown requestedACR: ${requestedACR}`);

  const byType = groupAmrsByType(model.amrs);
  const patterns: string[][] = [];

  for (const option of options) {
    let partials: string[][] = [[]];

    for (const req of option) {
      const ids = byType[req.type] || [];
      if (ids.length === 0) {
        partials = [];
        break;
      }

      const next: string[][] = [];
      for (const seq of partials) {
        for (const id of ids) {
          if (seq.includes(id)) continue;
          next.push([...seq, id]);
        }
      }
      partials = next;
    }

    patterns.push(...partials);
  }

  return dedupeUnordered(patterns);
}

export function calcMissingEnrollmentsForAcr(model: Model, user: User, requiredACR: string) {
  const options = model.acr[requiredACR];
  if (!options) throw new Error(`Unknown requiredACR: ${requiredACR}`);

  const byType = groupAmrsByType(model.amrs);
  const allUseful = new Set<string>();

  for (const option of options) {
    for (const req of option) {
      for (const id of byType[req.type] || []) allUseful.add(id);
    }
  }

  return [...allUseful].filter((id) => !user.enrolledMeans.includes(id));
}

function getCandidatesByType(model: Model, user: User, requiredType: AmrType) {
  const byType = groupAmrsByType(model.amrs);
  const ids = byType[requiredType] || [];
  return ids.filter((id) => user.enrolledMeans.includes(id));
}

function getValidIdsForRequirement(
  model: Model,
  req: Requirement,
  user: User,
  past: PastAuthAction[],
  nowMs: number
) {
  const candidates = getCandidatesByType(model, user, req.type);
  return candidates.filter((id) => isActionStillValid(past, id, req.maxAge, nowMs));
}

export function calcUserReqUserAuthActions(model: Model, sessionId: string, requiredACR: string): AcrCheckResult {
  const session = model.sessions.find((s) => s.id === sessionId);
  if (!session) throw new Error(`Unknown sessionId: ${sessionId}`);

  const user = model.users.find((u) => u.id === session.userId);
  if (!user) throw new Error(`Unknown userId: ${session.userId}`);

  const options = model.acr[requiredACR];
  if (!options) throw new Error(`Unknown requiredACR: ${requiredACR}`);

  const nowMs = Date.now();
  const missingEnrollments = calcMissingEnrollmentsForAcr(model, user, requiredACR);

  // OK if any option is satisfied (consuming distinct AMRs from history)
  for (const option of options) {
    const usedHistory = new Set<string>();
    let ok = true;

    for (const req of option) {
      const validIds = getValidIdsForRequirement(model, req, user, session.pastAuthenticationActions, nowMs);
      const pick = validIds.find((id) => !usedHistory.has(id));
      if (!pick) {
        ok = false;
        break;
      }
      usedHistory.add(pick);
    }

    if (ok) return { status: "OK", missingEnrollments };
  }

  // Otherwise compute possible actions to do now
  const possibleActions: string[][] = [];

  for (const option of options) {
    const stack: Array<{
      reqIndex: number;
      usedHistory: Set<string>;
      usedNew: Set<string>;
      toDo: string[];
    }> = [
      { reqIndex: 0, usedHistory: new Set(), usedNew: new Set(), toDo: [] },
    ];

    while (stack.length) {
      const state = stack.pop()!;
      const { reqIndex, usedHistory, usedNew, toDo } = state;

      if (reqIndex >= option.length) {
        possibleActions.push(toDo);
        continue;
      }

      const req = option[reqIndex];

      // A) satisfy from history if possible
      const validIds = getValidIdsForRequirement(model, req, user, session.pastAuthenticationActions, nowMs);
      let branchedHistory = false;

      for (const id of validIds) {
        if (usedHistory.has(id)) continue;

        const nextUsedHistory = new Set(usedHistory);
        nextUsedHistory.add(id);

        stack.push({
          reqIndex: reqIndex + 1,
          usedHistory: nextUsedHistory,
          usedNew: new Set(usedNew),
          toDo: [...toDo],
        });

        branchedHistory = true;
      }

      if (branchedHistory) continue;

      // B) need a NEW action now: enrolled + correct type + not reused + not already valid
      const candidates = getCandidatesByType(model, user, req.type).filter((id) => {
        if (usedHistory.has(id)) return false;
        if (usedNew.has(id)) return false;
        if (isActionStillValid(session.pastAuthenticationActions, id, req.maxAge, nowMs)) return false;
        return true;
      });

      for (const id of candidates) {
        const nextUsedNew = new Set(usedNew);
        nextUsedNew.add(id);

        stack.push({
          reqIndex: reqIndex + 1,
          usedHistory: new Set(usedHistory),
          usedNew: nextUsedNew,
          toDo: [...toDo, id],
        });
      }
    }
  }

  return {
    status: "authentication required",
    possibleActions: dedupeUnordered(possibleActions),
    missingEnrollments,
  };
}