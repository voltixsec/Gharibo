"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RecordViewer } from "./record-viewer";
import { useToast } from "@/hooks/use-toast";
import { Play, Loader2, FileText } from "lucide-react";
import type { ResearchRecord } from "@gharibo/shared";
import { formatDate, timeAgo } from "@/lib/utils";

export function TaskRunner() {
  const { toast } = useToast();
  const [task, setTask] = useState("structured-knowledge-building");
  const [input, setInput] = useState("");
  const [modelUsed, setModelUsed] = useState("");
  const [running, setRunning] = useState(false);
  const [records, setRecords] = useState<ResearchRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<ResearchRecord | null>(null);

  const handleRun = async () => {
    if (!input.trim()) {
      toast({ title: "Input required", variant: "destructive" });
      return;
    }
    setRunning(true);
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task,
          input,
          modelUsed: modelUsed || undefined,
        }),
      });
      const json = await res.json();
      if (json.code === 0) {
        toast({ title: "Task completed", variant: "success" });
        await refreshRecords();
      } else {
        toast({
          title: "Task failed",
          description: json.message,
          variant: "destructive",
        });
      }
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Research service unavailable",
        variant: "destructive",
      });
    } finally {
      setRunning(false);
    }
  };

  const refreshRecords = async () => {
    try {
      const res = await fetch("/api/research");
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = await res.json();
      if (json.code !== 0) throw new Error(json.message || "Request failed");
      setRecords(json.data);
    } catch (e) {
      setRecords([]);
      toast({
        title: "Could not load research records",
        description: e instanceof Error ? e.message : "Research service unavailable",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Run Research Task</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="task">Task</Label>
            <Input
              id="task"
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="structured-knowledge-building"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="input">Input (domain description, system, or topic)</Label>
            <Textarea
              id="input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Describe the domain or system to research..."
              className="min-h-[120px]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="model">Model (optional)</Label>
            <Input
              id="model"
              value={modelUsed}
              onChange={(e) => setModelUsed(e.target.value)}
              placeholder="e.g. gpt-4o-mini"
            />
          </div>

          <Button onClick={handleRun} disabled={running}>
            {running ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Run Task
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Records List */}
      <Card>
        <CardHeader>
          <CardTitle>Research Records</CardTitle>
        </CardHeader>
        <CardContent>
          {records.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No research records yet. Run a task to get started.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {records.map((record) => (
                <div
                  key={record.id}
                  className="flex cursor-pointer items-center gap-3 rounded-md border p-3 hover:bg-accent"
                  onClick={() => setSelectedRecord(record)}
                >
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{record.task}</p>
                    <p className="text-xs text-muted-foreground">
                      {record.candidateEntities.length} entities ·{" "}
                      {record.finalApprovedRecords.length} approved ·{" "}
                      Score: {record.rewardScore ?? "—"}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {timeAgo(record.createdAt)}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedRecord && (
        <RecordViewer
          record={selectedRecord}
          onClose={() => setSelectedRecord(null)}
        />
      )}
    </div>
  );
}
