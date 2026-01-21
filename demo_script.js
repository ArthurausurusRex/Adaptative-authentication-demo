// --------------------
// Configuration
// --------------------

const AMRS = [
  { id: "phone_otp", type: "single_factor" },
  { id: "password", type: "single_factor" },
  { id: "phone_biometry", type: "multi_factor" },
  { id: "mail_otp", type: "single_factor" },
];

const ACR = {
  normal: [
    [{ type: "single_factor", maxAge: 3600 }],
    [{ type: "multi_factor", maxAge: 3600 }],
  ],
  strong: [
    // Either: 2 single factors (one can be older than the other)
    [{ type: "single_factor", maxAge: 93600 }, { type: "single_factor", maxAge: 300 }],
    // Or: 1 multi factor (very recent)
    [{ type: "multi_factor", maxAge: 300 }],
  ],
};

const testData = {
  users: [
    { id: "arthur", enrolledMeans: ["phone_otp", "password", "phone_biometry"] },
    { id: "bigNoob", enrolledMeans: ["phone_otp", "password", "phone_biometry"] },
    { id: "otherNoob", enrolledMeans: ["phone_otp"] },
  ],
  authenticationSessions: [
    {
      id: "1",
      userId: "arthur",
      pastAuthenticationActions: [
        { id: "phone_otp", validatedAt: "1768999339620" },
        { id: "phone_biometry", validatedAt: "1768998339620" },
      ],
    },
    { id: "2", userId: "bigNoob", pastAuthenticationActions: [] },
    { id: "3", userId: "otherNoob", pastAuthenticationActions: [] },
  ],
};

// --------------------
// Precomputed indexes (for readability + speed)
// --------------------

const AMRS_BY_TYPE = AMRS.reduce((acc, amr) => {
  (acc[amr.type] ||= []).push(amr.id);
  return acc;
}, {});

// --------------------
// Helpers
// --------------------

function getSessionById(sessionId) {
  const session = testData.authenticationSessions.find((s) => s.id === sessionId);
  if (!session) throw new Error(`Unknown sessionId: ${sessionId}`);
  return session;
}

function getUserById(userId) {
  const user = testData.users.find((u) => u.id === userId);
  if (!user) throw new Error(`Unknown userId: ${userId}`);
  return user;
}

function dedupeUnordered(patterns) {
  // ["a","b"] === ["b","a"]
  const uniq = new Map(patterns.map((seq) => [[...seq].sort().join("|"), seq]));
  return [...uniq.values()];
}

function isActionStillValid(pastAuthenticationActions, amrId, maxAgeSeconds, nowMs) {
  const maxAgeMs = maxAgeSeconds * 1000;

  for (const past of pastAuthenticationActions) {
    if (past.id !== amrId) continue;

    const validatedAtMs = Number(past.validatedAt);
    if (Number.isNaN(validatedAtMs)) continue;

    if (nowMs - validatedAtMs <= maxAgeMs) return true;
  }
  return false;
}

function getCandidatesByType(user, requiredType) {
  // AMRs of this type that the user can do (enrolled)
  const ids = AMRS_BY_TYPE[requiredType] || [];
  return ids.filter((id) => user.enrolledMeans.includes(id));
}

function getValidIdsForRequirement(requirement, user, pastAuthenticationActions, nowMs) {
  const candidates = getCandidatesByType(user, requirement.type);
  return candidates.filter((id) => isActionStillValid(pastAuthenticationActions, id, requirement.maxAge, nowMs));
}

function calcMissingEnrollmentsForAcr(user, requiredACR) {
  const options = ACR[requiredACR];
  if (!options) throw new Error(`Unknown requiredACR: ${requiredACR}`);

  const allUsefulAmrs = new Set();

  for (const option of options) {
    for (const req of option) {
      const ids = AMRS_BY_TYPE[req.type] || [];
      for (const id of ids) allUsefulAmrs.add(id);
    }
  }

  return [...allUsefulAmrs].filter((id) => !user.enrolledMeans.includes(id));
}

// --------------------
// Core functions (please audit them if you plan to use them as-is in a production environment)
// --------------------
//Disclaimer : This was vibecoded and should nt be used as is in production or at least audited before (which I have not done) !!!

// Returns all possible authentication patterns for an ACR, ignoring user/session.
// Example: "normal" -> [["phone_otp"],["password"],["mail_otp"],["phone_biometry"]]
function calcRequiredAuthentications(requestedACR) {
  const options = ACR[requestedACR];
  if (!options) throw new Error(`Unknown requestedACR: ${requestedACR}`);

  const patterns = [];

  for (const option of options) {
    // Start with one empty pattern, then expand for each requirement in the option
    let partials = [[]];

    for (const req of option) {
      const ids = AMRS_BY_TYPE[req.type] || [];
      if (ids.length === 0) {
        partials = [];
        break;
      }

      const next = [];
      for (const seq of partials) {
        for (const id of ids) {
          if (seq.includes(id)) continue; // no repeated AMR within a pattern
          next.push([...seq, id]);
        }
      }
      partials = next;
    }

    patterns.push(...partials);
  }

  return dedupeUnordered(patterns);
}
//Disclaimer : This was vibecoded and should nt be used as is in production or at least audited before (which I have not done) !!!
// Returns what the user still needs to do NOW (given their enrollments + past validations)
// to satisfy the required ACR.
function calcUserReqUserAuthActions(sessionId, requiredACR) {
  const session = getSessionById(sessionId);
  const user = getUserById(session.userId);

  const options = ACR[requiredACR];
  if (!options) throw new Error(`Unknown requiredACR: ${requiredACR}`);

  const nowMs = Date.now();
  const missingEnrollments = calcMissingEnrollmentsForAcr(user, requiredACR);

  // 1) If ANY option is already satisfied (consume distinct AMRs from history), OK
  for (const option of options) {
    const usedHistory = new Set();
    let ok = true;

    for (const req of option) {
      const validIds = getValidIdsForRequirement(req, user, session.pastAuthenticationActions, nowMs);

      // pick one valid id not already used for a previous requirement
      const pick = validIds.find((id) => !usedHistory.has(id));
      if (!pick) {
        ok = false;
        break;
      }
      usedHistory.add(pick);
    }

    if (ok) return { status: "OK", missingEnrollments };
  }

  // 2) Otherwise, compute all possible action lists to do now to satisfy at least one option.
  const possibleActions = [];

  for (const option of options) {
    const stack = [
      {
        reqIndex: 0,
        usedHistory: new Set(),
        usedNew: new Set(),
        toDo: [],
      },
    ];

    while (stack.length) {
      const state = stack.pop();
      const { reqIndex, usedHistory, usedNew, toDo } = state;

      if (reqIndex >= option.length) {
        possibleActions.push(toDo);
        continue;
      }

      const req = option[reqIndex];

      // A) Try satisfying from history (using a still-valid, enrolled AMR, not reused)
      const validIds = getValidIdsForRequirement(req, user, session.pastAuthenticationActions, nowMs);
      let branchedFromHistory = false;

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

        branchedFromHistory = true;
      }

      if (branchedFromHistory) continue;

      // B) Otherwise, require a NEW action now (must be enrolled, right type, not reused,
      // and NOT already valid for this requirement)
      const candidates = getCandidatesByType(user, req.type).filter((id) => {
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

// --------------------
// Demo
// --------------------

console.log("Required auth patterns for strong:", calcRequiredAuthentications("strong"));
console.log("Required auth patterns for normal:", calcRequiredAuthentications("normal"));

console.log("Session 1 -> strong:", calcUserReqUserAuthActions("1", "strong"));
console.log("Session 1 -> normal:", calcUserReqUserAuthActions("1", "normal"));
console.log("Session 2 -> normal:", calcUserReqUserAuthActions("2", "normal"));
console.log("Session 2 -> strong:", calcUserReqUserAuthActions("2", "strong"));
console.log("Session 3 -> strong:", calcUserReqUserAuthActions("3", "strong"));

console.log("now(ms):", Date.now());