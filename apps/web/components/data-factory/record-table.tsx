"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Filters } from "./filters";
import { RecordEditor } from "./record-editor";
import { useToast } from "@/hooks/use-toast";
import type { DataFactoryRecord, VerificationStatus } from "@gharibo/shared";
import { truncate, formatDate } from "@/lib/utils";
import { ErrorState, StatusBadge } from "@/components/status";
import {
  Check,
  X,
  Tag,
  Pencil,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

/**
 * Record verification states map onto the shared semantic vocabulary so a
 * colour means the same thing here as it does everywhere else in the lab.
 * Only genuinely approved / training-ready records are green.
 */
const STATUS_VARIANT: Record<
  string,
  "neutral" | "queued" | "warning" | "success" | "failed"
> = {
  RAW: "neutral",
  NORMALIZED: "queued",
  REVIEW_REQUIRED: "warning",
  APPROVED: "success",
  REJECTED: "failed",
  TRAINING_READY: "success",
};

export function RecordTable() {
  const { toast } = useToast();
  const [records, setRecords] = useState<DataFactoryRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<VerificationStatus | "all">("all");
  const [domain, setDomain] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<DataFactoryRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (status !== "all") params.set("status", status);
    if (domain) params.set("domain", domain);
    if (search) params.set("search", search);

    try {
      const res = await fetch(`/api/data-factory?${params}`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = await res.json();
      if (json.code !== 0) throw new Error(json.message || "Request failed");
      setRecords(json.data.rows);
      setTotal(json.data.total);
    } catch (err) {
      setRecords([]);
      setTotal(0);
      setError(err instanceof Error ? err.message : "Failed to load records");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, status, domain, search]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkAction = async (action: "approve" | "reject" | "tag", value?: string) => {
    if (selected.size === 0) return;
    const res = await fetch("/api/data-factory/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selected), action, value }),
    });
    const json = await res.json();
    if (json.code === 0) {
      toast({ title: `${json.data.updated} records updated`, variant: "success" });
      setSelected(new Set());
      fetchRecords();
    }
  };

  const handleExport = () => {
    const params = new URLSearchParams();
    if (status !== "all") params.set("status", status);
    window.open(`/api/data-factory/export?${params}`, "_blank");
  };

  const handleImport = async (file: File) => {
    const text = await file.text();
    const res = await fetch("/api/data-factory/import", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: text,
    });
    const json = await res.json();
    if (json.code === 0) {
      toast({
        title: `Imported ${json.data.imported} records`,
        description: json.data.warnings.length > 0
          ? `${json.data.warnings.length} warnings`
          : "No warnings",
        variant: "success",
      });
      fetchRecords();
    } else {
      toast({ title: "Import failed", description: json.message, variant: "destructive" });
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="flex flex-col gap-4">
      <Filters
        search={search}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        status={status}
        onStatusChange={(v) => { setStatus(v); setPage(1); }}
        domain={domain}
        onDomainChange={(v) => { setDomain(v); setPage(1); }}
        onExport={handleExport}
        onImport={handleImport}
      />

      {/* Bulk Actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 rounded-md border p-2">
          <span className="text-sm text-muted-foreground">
            {selected.size} selected
          </span>
          <Button size="sm" variant="outline" onClick={() => handleBulkAction("approve")}>
            <Check className="mr-1 h-3 w-3" /> Approve
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleBulkAction("reject")}>
            <X className="mr-1 h-3 w-3" /> Reject
          </Button>
          <Button size="sm" variant="outline" onClick={() => {
            const tag = window.prompt("Enter tag:");
            if (tag) handleBulkAction("tag", tag);
          }}>
            <Tag className="mr-1 h-3 w-3" /> Tag
          </Button>
        </div>
      )}

      {/* Table */}
      {error ? (
        <ErrorState
          title="Could not load records"
          message={error}
          className="rounded-md border border-dashed"
        />
      ) : (
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={selected.size === records.length && records.length > 0}
                  onCheckedChange={(v) => {
                    if (v) setSelected(new Set(records.map((r) => r.id)));
                    else setSelected(new Set());
                  }}
                />
              </TableHead>
              <TableHead>Input</TableHead>
              <TableHead>Domain</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No records match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              records.map((record) => (
                <TableRow key={record.id}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(record.id)}
                      onCheckedChange={() => toggleSelect(record.id)}
                    />
                  </TableCell>
                  <TableCell className="max-w-xs">
                    <p className="truncate text-sm" title={record.input}>
                      {truncate(record.input, 60)}
                    </p>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {record.domain || "—"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      variant={STATUS_VARIANT[record.verificationStatus] || "neutral"}
                      label={record.verificationStatus}
                    />
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">
                    {record.qualityScore !== null ? record.qualityScore.toFixed(2) : "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {formatDate(record.updatedAt)}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={() => setEditing(record)}
                      aria-label="Edit record"
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      )}

      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {total} records total
        </p>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm tabular-nums">
            {page} / {totalPages || 1}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {editing && (
        <RecordEditor
          record={editing}
          onClose={() => setEditing(null)}
          onSaved={fetchRecords}
        />
      )}
    </div>
  );
}
