<!--
SYNC IMPACT REPORT
==================
Version change: (template, unversioned) → 0.1.0
Bump rationale: Initial ratification of a project-specific constitution from the
  unfilled template. Tagged 0.1.0 as a pre-1.0 draft per project decision,
  signalling that principles may change materially before 1.0.

Principles defined (4; reduced from 5 template slots per Simplicity/YAGNI):
  - [PRINCIPLE_1] → I. Simplicity & YAGNI
  - [PRINCIPLE_2] → II. User Experience Consistency
  - [PRINCIPLE_3] → III. Data Integrity & Safety (NON-NEGOTIABLE)
  - [PRINCIPLE_4] → IV. Quality Through Testing
  - [PRINCIPLE_5] → (intentionally omitted; YAGNI — no fifth principle added)

Sections:
  - [SECTION_2_NAME] → Additional Constraints
  - [SECTION_3_NAME] → Development Workflow
  - Governance (filled)

Templates / artifacts checked:
  ✅ .specify/templates/plan-template.md — "Constitution Check" gate references the
     constitution generically ([Gates determined based on constitution file]); no edit needed.
  ✅ .specify/templates/spec-template.md — no constitution coupling; no edit needed.
  ✅ .specify/templates/tasks-template.md — no constitution coupling; no edit needed.
  ✅ .specify/templates/checklist-template.md — no constitution coupling; no edit needed.

Deferred / follow-up TODOs: none. Ratification date set to first-fill date (2026-06-02).
-->

# data-editor Constitution

data-editor is an interactive data-editing application: a UI through which people
view and directly modify datasets. The principles below are non-negotiable rules
that govern how the project is designed, built, and reviewed.

## Core Principles

### I. Simplicity & YAGNI

The simplest design that satisfies the current, demonstrated requirement MUST be
chosen. Features, abstractions, configuration options, and dependencies MUST NOT
be added for hypothetical future needs ("You Aren't Gonna Need It").

- Every new abstraction, dependency, or layer MUST be justified by a concrete,
  present requirement; speculative generality is rejected in review.
- When two designs satisfy the requirement, the one with fewer moving parts MUST
  win unless a documented constraint (in the plan) overrides it.
- Added complexity MUST be recorded and justified in the plan's Complexity
  Tracking section; unjustified complexity is a blocking review finding.

**Rationale**: A data editor accretes features quickly. Disciplined simplicity
keeps the codebase debuggable, the UI learnable, and change cheap.

### II. User Experience Consistency

The editor MUST behave predictably and uniformly across the application. Users
MUST be able to transfer learned interactions from one part of the UI to another.

- Equivalent actions (edit, undo, save, navigate, select) MUST use the same
  interaction patterns, keyboard shortcuts, and visual affordances everywhere.
- Application state MUST be visible: the user MUST always be able to tell what is
  selected, what is unsaved, and whether an operation is in progress.
- Errors MUST be reported to the user in clear, actionable language at the point
  of action — never silently swallowed and never exposed as raw stack traces.

**Rationale**: Consistency is the difference between a tool users trust and one
they fear. In an editor, surprise equals lost work and lost confidence.

### III. Data Integrity & Safety (NON-NEGOTIABLE)

User data MUST NOT be silently lost, corrupted, or altered. The editor is a
custodian of the user's data first and a feature platform second.

- Every edit MUST be reversible: undo/redo (or an equivalent recovery path) is
  mandatory for any operation that mutates user data.
- Destructive actions (delete, overwrite, bulk transform) MUST be either
  confirmable or undoable; a destructive action that is both irreversible and
  unconfirmed is prohibited.
- Writes MUST validate input and fail loudly: on any error the prior valid state
  MUST be preserved rather than leaving data half-written or corrupted.
- Any operation that risks data loss MUST surface that risk to the user before
  committing it.

**Rationale**: The cardinal sin of a data editor is destroying the data it exists
to edit. This principle outranks convenience, performance, and feature scope.

### IV. Quality Through Testing

Behavior that matters MUST be protected by automated tests, and tests MUST be
meaningful rather than ceremonial.

- Data-mutating logic (edits, transforms, undo/redo, persistence) MUST have
  automated test coverage before it is considered done.
- Bug fixes MUST add a regression test that fails before the fix and passes after.
- The test suite MUST pass before any change is merged; a red suite is a blocking
  gate, not a warning.

**Rationale**: Integrity and consistency cannot be asserted by hope. Tests are how
those guarantees survive refactoring and new features.

## Additional Constraints

- The codebase MUST favor a small, well-understood dependency set; adding a
  runtime dependency requires justification under Principle I.
- User-facing behavior changes MUST be reflected in the feature spec before
  implementation, keeping spec and product in agreement.
- Performance is a feature of UX (Principle II): interactions on typical datasets
  MUST remain responsive; perceptible regressions MUST be treated as defects.

## Development Workflow

- Work flows through the Spec Kit lifecycle: specify → clarify → plan → tasks →
  implement, with the Constitution Check gate in the plan enforced before design.
- Every change is reviewed against these principles; reviewers MUST cite the
  specific principle when blocking, and complexity MUST be justified in the plan.
- The test suite (Principle IV) and the data-safety guarantees (Principle III) are
  hard gates: a change that breaks either MUST NOT be merged.

## Governance

This constitution supersedes other practices and conventions where they conflict.

- **Amendments**: Changes to this document MUST be proposed with a rationale and a
  version bump, and MUST include propagation to dependent templates and docs.
- **Versioning policy**: Semantic versioning applies — MAJOR for backward-
  incompatible governance/principle removals or redefinitions; MINOR for a new
  principle/section or materially expanded guidance; PATCH for clarifications and
  wording fixes. While the constitution is pre-1.0, principles may change
  materially between MINOR versions.
- **Compliance review**: All plans and reviews MUST verify compliance with these
  principles. Violations MUST be either fixed or explicitly justified in the
  plan's Complexity Tracking section.
- **Runtime guidance**: Use `CLAUDE.md` and the active feature plan for day-to-day
  development guidance; this constitution governs the non-negotiables they rest on.

**Version**: 0.1.0 | **Ratified**: 2026-06-02 | **Last Amended**: 2026-06-02
