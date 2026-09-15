import Link from "next/link";
import {
  FlaskConical,
  Search,
  Database,
  FolderGit2,
  Cpu,
  BarChart3,
  Boxes,
  GitBranch,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  Layers,
  Microscope,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { PageContent } from "@/components/page-content";
import {
  StateCard,
  MetricCard,
  StatusBadge,
  TruthNotice,
  EmptyState,
  HashDisplay,
} from "@/components/status";
import {
  getProjectState,
  getExperimentInfo,
  getGoldDatasetInfo,
  getModelStateInfo,
  getBlockerInfo,
  getEngineInfo,
  getTrainingLifecycle,
  lifecycleVariant,
  isStateAvailable,
} from "@/lib/dashboard";

const QUICK_ACTIONS = [
  { label: "Playground", href: "/playground", icon: FlaskConical },
  { label: "Research Gym", href: "/research-gym", icon: Search },
  { label: "Data Factory", href: "/data-factory", icon: Database },
  { label: "Datasets", href: "/datasets", icon: FolderGit2 },
  { label: "Training", href: "/training", icon: Cpu },
  { label: "Evaluations", href: "/evaluations", icon: BarChart3 },
  { label: "Models", href: "/models", icon: Boxes },
  { label: "Experiments", href: "/experiments", icon: GitBranch },
];

export default function DashboardPage() {
  const project = getProjectState();
  const experiment = getExperimentInfo();
  const gold = getGoldDatasetInfo();
  const model = getModelStateInfo();
  const blockers = getBlockerInfo();
  const engine = getEngineInfo();
  const lifecycle = getTrainingLifecycle();

  if (!isStateAvailable()) {
    return (
      <>
        <PageHeader
          title="Command Dashboard"
          description="GHARIBO project truth, read from the authoritative governance state."
        />
        <PageContent>
          <EmptyState
            title="Governance state unavailable"
            message="governance/GHARIBO_MASTER_STATE.json could not be read. The dashboard refuses to render substitute values, because fabricated project state is worse than none."
          />
        </PageContent>
      </>
    );
  }

  const milestoneVariant =
    project.milestoneStatus === "COMPLETE"
      ? "success"
      : project.milestoneStatus === "IN_PROGRESS"
        ? "pending"
        : "neutral";

  const goldStatusVariant = gold.status === "ACCEPTED" ? "success" : "warning";

  const latest = experiment.latestAttempt;
  const launchVariant =
    lifecycle.lifecycle === "FAILED"
      ? "failed"
      : lifecycle.lifecycle === "AUTHORIZED"
        ? "authorized"
        : lifecycle.lifecycle === "QUEUED"
          ? "queued"
          : "warning";

  return (
    <>
      <PageHeader
        title="Command Dashboard"
        description="Authoritative GHARIBO project truth, read directly from governance/GHARIBO_MASTER_STATE.json."
        meta={
          <>
            <StatusBadge
              variant={lifecycleVariant(lifecycle.lifecycle)}
              label={lifecycle.lifecycle}
              detail={lifecycle.reason}
            />
            {project.milestone && (
              <StatusBadge
                variant={milestoneVariant}
                label={`${project.milestone} · ${project.milestoneStatus ?? "UNKNOWN"}`}
              />
            )}
            {project.masterStateVersion && (
              <span className="text-xs text-muted-foreground">
                Master State v{project.masterStateVersion}
              </span>
            )}
          </>
        }
      />

      <PageContent width="wide">
        {/* ---------- A. PROJECT ---------- */}
        <StateCard
          title="Project"
          icon={<Layers className="h-4 w-4" />}
          description="Program, milestone and the current governed blocker."
          actions={
            project.updatedAt && (
              <span className="text-xs text-muted-foreground">
                updated {project.updatedAt}
              </span>
            )
          }
        >
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard label="Current Program" value={project.program} />
            <MetricCard
              label="Current Milestone"
              value={project.milestone}
              sublabel={project.milestoneTitle ?? undefined}
            />
            <div className="flex flex-col gap-1 rounded-md border bg-muted/30 px-3 py-2.5">
              <p className="text-xs font-medium text-muted-foreground">
                Milestone Status
              </p>
              <div>
                {project.milestoneStatus ? (
                  <StatusBadge
                    variant={milestoneVariant}
                    label={project.milestoneStatus}
                  />
                ) : (
                  <span className="text-sm text-muted-foreground">—</span>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-1 rounded-md border bg-muted/30 px-3 py-2.5">
              <p className="text-xs font-medium text-muted-foreground">
                Training State
              </p>
              <div>
                <StatusBadge
                  variant={lifecycleVariant(lifecycle.lifecycle)}
                  label={lifecycle.rawStatus ?? lifecycle.lifecycle}
                />
              </div>
            </div>
          </div>

          <div className="mt-3">
            <TruthNotice
              variant={lifecycle.invariantHolds ? "info" : "alert"}
              title={lifecycle.invariant ?? "Training invariant unavailable"}
              message={lifecycle.reason}
            />
          </div>
        </StateCard>

        {/* ---------- B. ACTIVE EXPERIMENT ---------- */}
        <StateCard
          title="Active Experiment"
          icon={<Microscope className="h-4 w-4" />}
          description="The governed run in flight, its worker and its authorization chain."
        >
          {experiment.experimentId ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <MetricCard
                  label="Experiment"
                  value={experiment.experimentId}
                  sublabel={experiment.experimentStatus ?? undefined}
                />
                <MetricCard label="Base Model" value={experiment.baseModel} mono />
                <MetricCard
                  label="Method"
                  value={
                    experiment.method && engine.quantization
                      ? `${experiment.method} · ${engine.quantization}`
                      : experiment.method
                  }
                />
                <MetricCard
                  label="Worker"
                  value={experiment.worker}
                  sublabel={experiment.workerProvider ?? undefined}
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard
                  label="Package ID"
                  value={
                    experiment.packageId ? (
                      <HashDisplay value={experiment.packageId} head={12} tail={4} />
                    ) : null
                  }
                />
                <MetricCard
                  label="Run ID"
                  value={
                    experiment.runId ? (
                      <HashDisplay value={experiment.runId} head={8} tail={4} />
                    ) : null
                  }
                />
                <div className="flex flex-col gap-1 rounded-md border bg-muted/30 px-3 py-2.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    Governed Run State
                  </p>
                  <div>
                    <StatusBadge
                      variant="queued"
                      label={experiment.runStatus ?? "—"}
                      detail="Run record state, not execution state"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1 rounded-md border bg-muted/30 px-3 py-2.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    Training Lifecycle
                  </p>
                  <div>
                    <StatusBadge
                      variant={lifecycleVariant(lifecycle.lifecycle)}
                      label={lifecycle.lifecycle}
                      detail={lifecycle.reason}
                    />
                  </div>
                </div>
              </div>

              {/* Authorization chain — explicitly NOT execution */}
              <div className="rounded-md border p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Authorization Chain
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">
                      Execution Authorization
                    </p>
                    <p className="truncate font-mono text-xs text-foreground">
                      {experiment.authorizationDecisionId ?? "—"}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">
                      Launch Authorization
                    </p>
                    <p className="truncate font-mono text-xs text-foreground">
                      {experiment.launchDecisionId ?? "—"}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Supersedes</p>
                    <p className="truncate font-mono text-xs text-foreground">
                      {experiment.supersedesDecisionId ?? "—"}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">
                      Launch Attempts
                    </p>
                    <p className="text-sm font-semibold text-foreground">
                      {experiment.attemptCount}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    Launch state
                  </span>
                  <StatusBadge
                    variant={launchVariant}
                    label={experiment.launchStatus ?? "—"}
                  />
                  <StatusBadge
                    variant={experiment.launchAccepted ? "success" : "not-started"}
                    label={experiment.launchAccepted ? "Launch accepted" : "Not accepted"}
                  />
                  <StatusBadge
                    variant="not-started"
                    label="Execution not started"
                    detail="No external evidence of execution"
                  />
                </div>
              </div>

              {/* Attempt history — real, verbatim */}
              {latest && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Launch Attempt History
                  </p>
                  <div className="space-y-2">
                    {experiment.attempts.map((attempt) => (
                      <div
                        key={`${attempt.attemptNumber}-${attempt.decisionId}`}
                        className="rounded-md border bg-muted/30 px-3 py-2"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-foreground">
                            Attempt {attempt.attemptNumber ?? "?"}
                          </span>
                          {attempt.decisionId && (
                            <span className="font-mono text-xs text-muted-foreground">
                              {attempt.decisionId}
                            </span>
                          )}
                          <StatusBadge
                            variant={
                              attempt.externalStatus?.includes("ERROR")
                                ? "failed"
                                : attempt.externalStatus === "COMPLETE"
                                  ? "success"
                                  : "warning"
                            }
                            label={attempt.externalStatus ?? "UNKNOWN"}
                          />
                          <StatusBadge
                            variant={
                              attempt.trainingStarted ? "running" : "not-started"
                            }
                            label={
                              attempt.trainingStarted
                                ? "Training started"
                                : "Training never started"
                            }
                          />
                        </div>
                        {attempt.terminalStage && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Terminal stage: {attempt.terminalStage}
                          </p>
                        )}
                        {attempt.rootCauseClass && (
                          <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                            {attempt.rootCauseClass}
                          </p>
                        )}
                        {attempt.rootCauseDetail && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {attempt.rootCauseDetail}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <EmptyState
              title="No active experiment"
              message="GHARIBO-exp-001 is not present in the governance state."
            />
          )}
        </StateCard>

        {/* ---------- C. GOVERNED GOLD ---------- */}
        <StateCard
          title="Governed Gold"
          icon={<ShieldCheck className="h-4 w-4" />}
          description="The official content-frozen corpus with its own governed physical source."
          actions={
            gold.status && (
              <StatusBadge variant={goldStatusVariant} label={gold.status} />
            )
          }
        >
          {gold.datasetId ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <MetricCard
                  label="Dataset Identity"
                  value={gold.datasetId}
                  sublabel={gold.version ? `v${gold.version}` : undefined}
                />
                <MetricCard label="Total" value={gold.exampleCount} />
                <MetricCard
                  label="Format"
                  value={gold.format}
                  sublabel={gold.contentFrozen ? "Content frozen" : "Not frozen"}
                />
                <MetricCard
                  label="Split Seed"
                  value={gold.splitSeed}
                  mono
                />
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Split
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <MetricCard label="TRAIN" value={gold.train} />
                  <MetricCard label="VALIDATION" value={gold.validation} />
                  <MetricCard
                    label="TEST"
                    value={gold.test}
                    sublabel="Permanently held out"
                  />
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Audit Cohort
                </p>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <MetricCard label="Cohort Size" value={gold.auditCohortSize} />
                  <MetricCard
                    label="PASS"
                    value={gold.auditPass}
                    tone={gold.auditPass === gold.auditCohortSize ? "success" : "default"}
                  />
                  <MetricCard
                    label="NEEDS REVIEW"
                    value={gold.auditNeedsReview}
                    tone={gold.auditNeedsReview === 0 ? "default" : "warning"}
                  />
                  <MetricCard
                    label="FAIL"
                    value={gold.auditFail}
                    tone={gold.auditFail === 0 ? "default" : "danger"}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="min-w-0 rounded-md border bg-muted/30 px-3 py-2.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    TEST Audited (audited ∩ TEST)
                  </p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">
                    {gold.auditedTestCount ?? "—"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Zero by construction — the audit cohort is quarantined into TRAIN
                    and VALIDATION.
                  </p>
                </div>
                <div className="min-w-0 rounded-md border bg-muted/30 px-3 py-2.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    Dataset Hash
                  </p>
                  <div className="mt-1">
                    <HashDisplay value={gold.datasetHash} head={16} tail={8} />
                  </div>
                </div>
              </div>

              {gold.testUsage && (
                <TruthNotice
                  variant="verified"
                  title={`TEST policy: ${gold.testUsage}`}
                  message={
                    gold.testPayloadIncluded === false
                      ? "The TEST payload is not included in the training package and has not been accessed."
                      : "TEST remains held out from training, tuning and checkpoint selection."
                  }
                />
              )}
            </div>
          ) : (
            <EmptyState
              title="Governed Gold not available"
              message="No governed dataset record is present in the master state."
            />
          )}
        </StateCard>

        {/* ---------- D. MODEL ---------- */}
        <StateCard
          title="Model"
          icon={<Boxes className="h-4 w-4" />}
          description="Registry status, evaluation state and promotion gate."
        >
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard
              label="Base Model Candidate"
              value={model.baseModelId}
              mono
              sublabel={model.baseModelRole ?? undefined}
            />
            <div className="flex flex-col gap-1 rounded-md border bg-muted/30 px-3 py-2.5">
              <p className="text-xs font-medium text-muted-foreground">
                Evaluation
              </p>
              <div>
                <StatusBadge
                  variant={
                    model.evaluationState === "NOT_RUN"
                      ? "not-run"
                      : model.evaluationState
                        ? "pending"
                        : "neutral"
                  }
                  label={model.evaluationState ?? "—"}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1 rounded-md border bg-muted/30 px-3 py-2.5">
              <p className="text-xs font-medium text-muted-foreground">
                Promotion
              </p>
              <div>
                <StatusBadge
                  variant={model.hasPromotedModel ? "success" : "not-started"}
                  label={model.hasPromotedModel ? "Promoted" : "Not promoted"}
                />
              </div>
            </div>
            <MetricCard
              label="Promotion Target"
              value={model.promotionTarget ?? null}
              sublabel="Reserved — not created"
            />
          </div>

          {model.derivedModels.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Derived Models
              </p>
              {model.derivedModels.map((m) => (
                <div
                  key={m.id}
                  className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2"
                >
                  <span className="font-mono text-sm text-foreground">{m.id}</span>
                  <StatusBadge
                    variant={
                      m.status === "NOT_CREATED"
                        ? "not-started"
                        : m.status === "EXPERIMENT"
                          ? "pending"
                          : "neutral"
                    }
                    label={m.status}
                  />
                  {m.note && (
                    <span className="text-xs text-muted-foreground">{m.note}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {!model.hasPromotedModel && (
            <div className="mt-3">
              <TruthNotice
                variant="warning"
                title="GHARIBO-V0.1 has not been created"
                message="A model earns its version number through evaluation and promotion, not intent. Training has not started and no evaluation result exists."
              />
            </div>
          )}
        </StateCard>

        {/* ---------- E. BLOCKER / NEXT ACTION ---------- */}
        <StateCard
          title="Blocker / Next Action"
          icon={<AlertTriangle className="h-4 w-4" />}
          description="What is currently stopping progress, and the single next governed step."
          actions={
            blockers.openBlockers.length > 0 ? (
              <StatusBadge
                variant="warning"
                label={`${blockers.openBlockers.length} open`}
              />
            ) : (
              <StatusBadge variant="success" label="No open blockers" />
            )
          }
        >
          {blockers.summary ? (
            <TruthNotice
              variant="warning"
              title="Current blocker"
              message={blockers.summary}
            />
          ) : (
            <EmptyState
              title="No blocker recorded"
              message="No blocker summary is present in the master state."
            />
          )}

          {blockers.nextActions.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Next Actions
              </p>
              {blockers.nextActions.map((action) => (
                <div
                  key={action.id}
                  className="rounded-md border bg-muted/30 px-3 py-2.5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      {action.id}
                    </span>
                    <StatusBadge
                      variant={action.priority === "P0" ? "warning" : "neutral"}
                      label={action.priority}
                    />
                    {action.requires && (
                      <span className="font-mono text-xs text-muted-foreground">
                        requires {action.requires}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-foreground">{action.action}</p>
                </div>
              ))}
            </div>
          )}

          {blockers.blockers.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Closed Blockers
              </p>
              {blockers.blockers
                .filter((b) => b.status.toUpperCase() === "CLOSED")
                .map((b) => (
                  <div
                    key={b.id}
                    className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2"
                  >
                    <span className="font-mono text-xs text-muted-foreground">
                      {b.id}
                    </span>
                    <span className="text-sm text-muted-foreground">{b.title}</span>
                    <StatusBadge variant="success" label={b.status} />
                  </div>
                ))}
            </div>
          )}
        </StateCard>

        {/* ---------- F. QUICK ACTIONS ---------- */}
        <StateCard
          title="Quick Actions"
          description="Jump to the primary GHARIBO workflows."
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {QUICK_ACTIONS.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-accent"
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
                  <span className="truncate text-sm font-medium text-foreground">
                    {item.label}
                  </span>
                  <ArrowRight className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              );
            })}
          </div>
        </StateCard>
      </PageContent>
    </>
  );
}
