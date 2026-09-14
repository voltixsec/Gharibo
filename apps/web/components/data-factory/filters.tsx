"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Download, Upload } from "lucide-react";
import type { VerificationStatus } from "@gharibo/shared";

interface FiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  status: VerificationStatus | "all";
  onStatusChange: (value: VerificationStatus | "all") => void;
  domain: string;
  onDomainChange: (value: string) => void;
  onExport: () => void;
  onImport: (file: File) => void;
}

const STATUS_OPTIONS: (VerificationStatus | "all")[] = [
  "all",
  "RAW",
  "NORMALIZED",
  "REVIEW_REQUIRED",
  "APPROVED",
  "REJECTED",
  "TRAINING_READY",
];

export function Filters({
  search,
  onSearchChange,
  status,
  onStatusChange,
  domain,
  onDomainChange,
  onExport,
  onImport,
}: FiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search records..."
          className="pl-9"
        />
      </div>

      <Select
        value={status}
        onValueChange={(v) => onStatusChange(v as VerificationStatus | "all")}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((s) => (
            <SelectItem key={s} value={s}>
              {s === "all" ? "All Statuses" : s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        value={domain}
        onChange={(e) => onDomainChange(e.target.value)}
        placeholder="Domain"
        className="w-[140px]"
      />

      <Button variant="outline" size="sm" onClick={onExport}>
        <Download className="mr-2 h-4 w-4" />
        Export
      </Button>

      <label>
        <input
          type="file"
          accept=".jsonl"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onImport(file);
          }}
        />
        <Button variant="outline" size="sm" asChild>
          <span>
            <Upload className="mr-2 h-4 w-4" />
            Import
          </span>
        </Button>
      </label>
    </div>
  );
}
