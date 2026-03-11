export type AmrType = "weak_factor" | "single_factor" | "multi_factor";

export type Amr = {
  id: string;
  type: AmrType;
  category: string;
};

export type Requirement = {
  type: AmrType;
  maxAge: number;
};

export type Acr = Record<string, Requirement[][]>;

export type User = {
  id: string;
  enrolledMeans: string[];
};

export type PastAuthAction = {
  id: string;
  validatedAt: string;
};

export type Session = {
  id: string;
  userId: string;
  pastAuthenticationActions: PastAuthAction[];
};

export type Model = {
  amrs: Amr[];
  acr: Acr;
  users: User[];
  sessions: Session[];
};

export type AcrCheckResult =
  | {
      status: "OK";
      missingEnrollments: string[];
    }
  | {
      status: "authentication required";
      possibleActions: string[][];
      missingEnrollments: string[];
    };

function groupAmrsByType(amrs: Amr[]) {
  const map: Record<string, string[]> = {};
  for (const amr of amrs) {
    if (!map[amr.type]) map[amr.type] = [];
    map[amr.type].push(amr.id);
  }
  return map as Record<AmrType, string[]>;
}

function getAmrById(amrs: Amr[], amrId: string) {
  return amrs.find((amr) => amr.id === amrId);
}

function isCategoryAllowed(
  amrs: Amr[],
  amrId: string,
  requirement: Requirement,
  usedSingleFactorCategories: Set<string>
) {
  if (requirement.type !== "single_factor") return true;

  const amr = getAmrById(amrs, amrId);
  if (!amr) return false;

  return !usedSingleFactorCategories.has(amr.category);
}

function addCategoryIfNeeded(
  amrs: Amr[],
  amrId: string,
  requirement: Requirement,
  usedSingleFactorCategories: Set<string>
) {
  const next = new Set(usedSingleFactorCategories);

  if (requirement.type === "single_factor") {
    const amr = getAmrById(amrs, amrId);
    if (amr) next.add(amr.category);
  }

  return next;
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
  const effectiveAcr = requestedACR === "strong_if_available" ? "strong" : requestedACR;

  const options = model.acr[effectiveAcr];
  if (!options) throw new Error(`Unknown requestedACR: ${effectiveAcr}`);

  const byType = groupAmrsByType(model.amrs);
  const patterns: string[][] = [];

  for (const option of options) {
    const stack: Array<{
      reqIndex: number;
      seq: string[];
      usedSingleFactorCategories: Set<string>;
    }> = [
      {
        reqIndex: 0,
        seq: [],
        usedSingleFactorCategories: new Set(),
      },
    ];

    while (stack.length) {
      const state = stack.pop()!;
      const { reqIndex, seq, usedSingleFactorCategories } = state;

      if (reqIndex >= option.length) {
        patterns.push(seq);
        continue;
      }

      const req = option[reqIndex];
      const ids = byType[req.type] || [];

      for (const id of ids) {
        if (seq.includes(id)) continue;
        if (!isCategoryAllowed(model.amrs, id, req, usedSingleFactorCategories)) continue;

        stack.push({
          reqIndex: reqIndex + 1,
          seq: [...seq, id],
          usedSingleFactorCategories: addCategoryIfNeeded(model.amrs, id, req, usedSingleFactorCategories),
        });
      }
    }
  }

  return dedupeUnordered(patterns);
}

export function calcMissingEnrollmentsForAcr(model: Model, user: User, requiredACR: string) {
  const effectiveAcr = requiredACR === "strong_if_available" ? "strong" : requiredACR;

  const options = model.acr[effectiveAcr];
  if (!options) throw new Error(`Unknown requiredACR: ${effectiveAcr}`);

  const byType = groupAmrsByType(model.amrs);
  const allUseful = new Set<string>();

  for (const option of options) {
    for (const req of option) {
      for (const id of byType[req.type] || []) {
        allUseful.add(id);
      }
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

function canUserSatisfyAcrFromEnrollment(model: Model, user: User, acrName: string) {
  const options = model.acr[acrName];
  if (!options) return false;

  const byType = groupAmrsByType(model.amrs);

  for (const option of options) {
    const stack: Array<{
      reqIndex: number;
      usedIds: Set<string>;
      usedSingleFactorCategories: Set<string>;
    }> = [
      {
        reqIndex: 0,
        usedIds: new Set(),
        usedSingleFactorCategories: new Set(),
      },
    ];

    while (stack.length) {
      const state = stack.pop()!;
      const { reqIndex, usedIds, usedSingleFactorCategories } = state;

      if (reqIndex >= option.length) {
        return true;
      }

      const req = option[reqIndex];
      const ids = (byType[req.type] || []).filter((id) => user.enrolledMeans.includes(id));

      for (const id of ids) {
        if (usedIds.has(id)) continue;
        if (!isCategoryAllowed(model.amrs, id, req, usedSingleFactorCategories)) continue;

        const nextUsedIds = new Set(usedIds);
        nextUsedIds.add(id);

        stack.push({
          reqIndex: reqIndex + 1,
          usedIds: nextUsedIds,
          usedSingleFactorCategories: addCategoryIfNeeded(
            model.amrs,
            id,
            req,
            usedSingleFactorCategories
          ),
        });
      }
    }
  }

  return false;
}

function resolveEffectiveAcr(model: Model, user: User, requestedACR: string) {
  if (requestedACR === "strong_if_available") {
    return canUserSatisfyAcrFromEnrollment(model, user, "strong") ? "strong" : "normal";
  }

  return requestedACR;
}

export function calcUserReqUserAuthActions(model: Model, sessionId: string, requiredACR: string): AcrCheckResult {
  const session = model.sessions.find((s) => s.id === sessionId);
  if (!session) throw new Error(`Unknown sessionId: ${sessionId}`);

  const user = model.users.find((u) => u.id === session.userId);
  if (!user) throw new Error(`Unknown userId: ${session.userId}`);

  const effectiveAcr = resolveEffectiveAcr(model, user, requiredACR);

  const options = model.acr[effectiveAcr];
  if (!options) throw new Error(`Unknown requiredACR: ${effectiveAcr}`);

  const nowMs = Date.now();
  const missingEnrollments = calcMissingEnrollmentsForAcr(model, user, effectiveAcr);

  for (const option of options) {
    const usedHistory = new Set<string>();
    let usedSingleFactorCategories = new Set<string>();
    let ok = true;

    for (const req of option) {
      const validIds = getValidIdsForRequirement(model, req, user, session.pastAuthenticationActions, nowMs);

      const pick = validIds.find((id) => {
        if (usedHistory.has(id)) return false;
        if (!isCategoryAllowed(model.amrs, id, req, usedSingleFactorCategories)) return false;
        return true;
      });

      if (!pick) {
        ok = false;
        break;
      }

      usedHistory.add(pick);
      usedSingleFactorCategories = addCategoryIfNeeded(model.amrs, pick, req, usedSingleFactorCategories);
    }

    if (ok) {
      return {
        status: "OK",
        missingEnrollments,
      };
    }
  }

  const possibleActions: string[][] = [];

  for (const option of options) {
    const stack: Array<{
      reqIndex: number;
      usedHistory: Set<string>;
      usedNew: Set<string>;
      usedSingleFactorCategories: Set<string>;
      toDo: string[];
    }> = [
      {
        reqIndex: 0,
        usedHistory: new Set(),
        usedNew: new Set(),
        usedSingleFactorCategories: new Set(),
        toDo: [],
      },
    ];

    while (stack.length) {
      const state = stack.pop()!;
      const { reqIndex, usedHistory, usedNew, usedSingleFactorCategories, toDo } = state;

      if (reqIndex >= option.length) {
        possibleActions.push(toDo);
        continue;
      }

      const req = option[reqIndex];

      const validIds = getValidIdsForRequirement(model, req, user, session.pastAuthenticationActions, nowMs);

      let branchedHistory = false;

      for (const id of validIds) {
        if (usedHistory.has(id)) continue;
        if (!isCategoryAllowed(model.amrs, id, req, usedSingleFactorCategories)) continue;

        const nextUsedHistory = new Set(usedHistory);
        nextUsedHistory.add(id);

        stack.push({
          reqIndex: reqIndex + 1,
          usedHistory: nextUsedHistory,
          usedNew: new Set(usedNew),
          usedSingleFactorCategories: addCategoryIfNeeded(model.amrs, id, req, usedSingleFactorCategories),
          toDo: [...toDo],
        });

        branchedHistory = true;
      }

      if (branchedHistory) continue;

      const candidates = getCandidatesByType(model, user, req.type).filter((id) => {
        if (usedHistory.has(id)) return false;
        if (usedNew.has(id)) return false;
        if (isActionStillValid(session.pastAuthenticationActions, id, req.maxAge, nowMs)) return false;
        if (!isCategoryAllowed(model.amrs, id, req, usedSingleFactorCategories)) return false;
        return true;
      });

      for (const id of candidates) {
        const nextUsedNew = new Set(usedNew);
        nextUsedNew.add(id);

        stack.push({
          reqIndex: reqIndex + 1,
          usedHistory: new Set(usedHistory),
          usedNew: nextUsedNew,
          usedSingleFactorCategories: addCategoryIfNeeded(model.amrs, id, req, usedSingleFactorCategories),
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