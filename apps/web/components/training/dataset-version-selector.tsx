"use client";

import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Dataset } from "@gharibo/shared";

interface DatasetVersionSelectorProps {
  datasets: Dataset[];
  value: string;
  onChange: (id: string) => void;
  loading?: boolean;
}

/**
 * Lists immutable dataset versions. A version is only exportable once it is
 * TRAINING_READY; DRAFT datasets are shown but flagged (the build will cut a version
 * from their records, which fails loudly if any record is not TRAINING_READY).
 */
export function DatasetVersionSelector({
  datasets,
  value,
  onChange,
  loading,
}: DatasetVersionSelectorProps) {
  const selected = datasets.find((d) => d.id === value) ?? null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <Select value={value} onValueChange={onChange} disabled={loading}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={loading ? "Loading datasets…" : "Select a dataset version"} />
          </SelectTrigger>
          <SelectContent>
            {datasets.length === 0 ? (
              <SelectItem value="__none__" disabled>
                No datasets yet
              </SelectItem>
            ) : (
              datasets.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name} {d.version} · {d.recordCount} records
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        {selected && (
          <Badge
            variant={selected.status === "TRAINING_READY" ? "success" : "warning"}
            className="shrink-0 text-xs"
          >
            {selected.status ?? "DRAFT"}
          </Badge>
        )}
      </div>
      {selected && selected.status !== "TRAINING_READY" && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          This version is not TRAINING_READY. Generating a package will cut a new
          content-addressed version from its records; this fails loudly if any record is
          not yet TRAINING_READY.
        </p>
      )}
      {selected?.datasetHash && (
        <p className="text-xs text-muted-foreground">
          content hash: <span className="font-mono">{selected.datasetHash.slice(0, 16)}…</span>
        </p>
      )}
    </div>
  );
}
