"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ResearchRecord } from "@gharibo/shared";
import { formatDate } from "@/lib/utils";

interface RecordViewerProps {
  record: ResearchRecord;
  onClose: () => void;
}

export function RecordViewer({ record, onClose }: RecordViewerProps) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[80vh] max-w-3xl">
        <DialogHeader>
          <DialogTitle>Research Record</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="flex flex-col gap-4">
            {/* Summary */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted-foreground">Task</p>
                <p className="text-sm font-medium">{record.task}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Created</p>
                <p className="text-sm font-medium">{formatDate(record.createdAt)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Model</p>
                <p className="text-sm font-medium">{record.modelUsed || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Duration</p>
                <p className="text-sm font-medium">{record.duration ?? "—"}s</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Reward Score</p>
                <p className="text-sm font-medium">{record.rewardScore ?? "—"}</p>
              </div>
            </div>

            <Separator />

            {/* Input */}
            <div>
              <p className="text-xs text-muted-foreground">Input</p>
              <p className="mt-1 text-sm">{record.input}</p>
            </div>

            {/* Instructions */}
            {record.instructions && (
              <div>
                <p className="text-xs text-muted-foreground">Instructions</p>
                <p className="mt-1 text-sm">{record.instructions}</p>
              </div>
            )}

            <Separator />

            {/* Candidate Entities */}
            <div>
              <p className="text-xs text-muted-foreground">
                Candidate Entities ({record.candidateEntities.length})
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {record.candidateEntities.map((entity, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {entity.type}: {entity.name}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Generated Records */}
            <div>
              <p className="text-xs text-muted-foreground">
                Generated Records ({record.generatedRecords.length})
              </p>
              <div className="mt-2 flex flex-col gap-2">
                {record.generatedRecords.map((rec, i) => (
                  <div key={i} className="rounded-md border p-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {rec.entityType}
                      </Badge>
                      <span className="text-sm font-medium">
                        {String(rec.data.name ?? "") || "Unnamed"}
                      </span>
                      {rec.verified && (
                        <Badge variant="success" className="text-xs">
                          Verified
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Validation Failures */}
            {record.validationFailures.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground">
                  Validation Failures ({record.validationFailures.length})
                </p>
                <div className="mt-2 flex flex-col gap-1">
                  {record.validationFailures.map((fail, i) => (
                    <div key={i} className="rounded-md border border-destructive/30 p-2">
                      <Badge variant="destructive" className="text-xs">
                        {fail.validator}
                      </Badge>
                      <p className="mt-1 text-xs">{fail.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Duplicates */}
            {record.duplicatesFound.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground">
                  Duplicates Found ({record.duplicatesFound.length})
                </p>
                <div className="mt-2 flex flex-col gap-1">
                  {record.duplicatesFound.map((dup, i) => (
                    <p key={i} className="text-xs">
                      {typeof dup === "string" ? dup : JSON.stringify(dup)}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Final Approved */}
            <div>
              <p className="text-xs text-muted-foreground">
                Final Approved Records ({record.finalApprovedRecords.length})
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {record.finalApprovedRecords.map((rec, i) => (
                  <Badge key={i} variant="success" className="text-xs">
                    {rec.entityType}: {String(rec.data.name ?? "") || "Unnamed"}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
