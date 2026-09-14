"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { TrainingPackage } from "@gharibo/shared";

interface ConfigInspectorProps {
  pkg: TrainingPackage | null;
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b py-1.5 last:border-b-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-right text-xs ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

/**
 * Shows the generated QLoRA/SFT configuration (from the package). The Harmony mapping
 * and the hidden-channel rule are shown; a rendered `analysis` string is never shown.
 */
export function ConfigInspector({ pkg }: ConfigInspectorProps) {
  if (!pkg) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Training Config Inspector</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Select a dataset version and a run, then generate a Training Package to inspect
            the exact QLoRA/SFT configuration.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Training Config Inspector</CardTitle>
        <Badge variant="outline" className="text-xs">
          {pkg.quantization} · {pkg.method}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col">
        <Row label="Experiment" value={pkg.experimentId} />
        <Row label="Package id (content address)" value={`${pkg.packageId.slice(0, 24)}…`} mono />
        <Row label="Schema version" value={pkg.schemaVersion} />
        <Row label="Git commit" value={pkg.gitCommitSha} mono />
        <Row label="Base model (identity)" value={`${pkg.baseModel} @ ${pkg.baseModelRevision}`} mono />
        <Row label="Loader model" value={pkg.loaderModelId} mono />
        <Row label="dtype" value={pkg.dtype} />
        <Row label="Sequence length" value={String(pkg.sequenceLength)} />
        <Row
          label="Batch / grad-accum"
          value={`${pkg.batch.perDeviceTrainBatchSize} / ${pkg.batch.gradientAccumulationSteps}`}
        />
        <Row label="Optimizer" value={pkg.optimizer} />
        <Row label="Learning rate" value={String(pkg.learningRate)} />
        <Row
          label="Epochs / max steps"
          value={pkg.epochs !== null ? `${pkg.epochs} epochs` : `max ${pkg.maxSteps} steps`}
        />
        <Row label="Warmup / scheduler / decay" value={`${pkg.warmupSteps} / ${pkg.lrSchedulerType} / ${pkg.weightDecay}`} />
        <Row label="LoRA r / alpha" value={`${pkg.lora.r} / ${pkg.lora.alpha}`} />
        <Row label="LoRA target modules" value={pkg.lora.targetModules.join(", ")} mono />
        <Row label="Seed" value={String(pkg.seed)} />
        <Row
          label="Checkpoint policy"
          value={`${pkg.checkpointPolicy.saveStrategy} · every ${pkg.checkpointPolicy.saveSteps} · keep ${pkg.checkpointPolicy.saveTotalLimit}`}
        />
        <Row
          label="Resume from checkpoint"
          value={pkg.checkpointPolicy.resumeFromCheckpoint ?? "—"}
          mono
        />
        <Row label="Dataset hash" value={`${pkg.dataset.datasetHash.slice(0, 24)}…`} mono />
        <Row
          label="Split hashes (train/val/test)"
          value={`${pkg.dataset.splitHashes.train.slice(0, 8)}… / ${pkg.dataset.splitHashes.validation.slice(0, 8)}… / ${pkg.dataset.splitHashes.test.slice(0, 8)}…`}
          mono
        />
        <Row
          label="Split policy"
          value={`${pkg.dataset.splitPolicy.algorithm} · seed ${pkg.dataset.splitPolicy.seed} · min ${pkg.dataset.splitPolicy.minimumRecordsPerSplit}/split`}
        />
        <Row label="Engine" value={`${pkg.engine.engine} ${pkg.engine.engineVersion}`} />
        <Row label="Pinned dependencies" value={`${pkg.engine.dependencies.length} packages`} />
        <Row label="Artifact destination" value={pkg.artifactDestination ? pkg.artifactDestination.kind : "local fallback"} />
        <Row label="Evaluation" value={`${pkg.evaluationConfig.status} (not executed)`} />
        <Row
          label="Harmony mapping"
          value={`developer → user → [analysis (HIDDEN)] → final · effort ${pkg.harmony.reasoningEffort}`}
        />
      </CardContent>
    </Card>
  );
}
