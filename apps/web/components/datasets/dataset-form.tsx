"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Check } from "lucide-react";
import type { DataFactoryRecord } from "@gharibo/shared";
import { truncate } from "@/lib/utils";

interface DatasetFormProps {
  onCreated: () => void;
}

export function DatasetForm({ onCreated }: DatasetFormProps) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [records, setRecords] = useState<DataFactoryRecord[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const fetchApproved = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/data-factory?status=APPROVED&page=1&pageSize=1000");
      const json = await res.json();
      if (json.code === 0) {
        setRecords(json.data.rows);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApproved();
  }, []);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreate = async () => {
    if (!name.trim() || selected.size === 0) {
      toast({ title: "Name and at least one record required", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/datasets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          recordIds: Array.from(selected),
        }),
      });
      const json = await res.json();
      if (json.code === 0) {
        toast({ title: `Dataset ${json.data.version} created with ${json.data.recordCount} records`, variant: "success" });
        setName("");
        setSelected(new Set());
        onCreated();
      } else {
        toast({ title: "Failed to create dataset", description: json.message, variant: "destructive" });
      }
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Assemble Dataset</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dataset-name">Dataset Name</Label>
          <Input
            id="dataset-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-training-dataset"
          />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {selected.size} of {records.length} records selected
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (selected.size === records.length) setSelected(new Set());
              else setSelected(new Set(records.map((r) => r.id)));
            }}
          >
            {selected.size === records.length ? "Deselect All" : "Select All"}
          </Button>
        </div>

        <ScrollArea className="h-64 rounded-md border">
          <div className="flex flex-col gap-1 p-2">
            {loading ? (
              <p className="text-center text-sm text-muted-foreground py-4">Loading approved records...</p>
            ) : records.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-4">
                No approved records. Approve records in Data Factory first.
              </p>
            ) : (
              records.map((record) => (
                <label
                  key={record.id}
                  className="flex cursor-pointer items-center gap-3 rounded-md p-2 hover:bg-accent"
                >
                  <Checkbox
                    checked={selected.has(record.id)}
                    onCheckedChange={() => toggleSelect(record.id)}
                  />
                  <div className="flex-1 overflow-hidden">
                    <p className="truncate text-sm">{truncate(record.input, 60)}</p>
                    <p className="text-xs text-muted-foreground">
                      {record.domain || "—"} · {record.language || "—"}
                    </p>
                  </div>
                </label>
              ))
            )}
          </div>
        </ScrollArea>

        <Button onClick={handleCreate} disabled={creating || !name || selected.size === 0}>
          <Check className="mr-2 h-4 w-4" />
          {creating ? "Creating..." : `Create Dataset (${selected.size} records)`}
        </Button>
      </CardContent>
    </Card>
  );
}
