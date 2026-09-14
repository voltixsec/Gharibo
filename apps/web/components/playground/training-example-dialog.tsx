"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import type { ConversationMessage, ConversationWithMessages } from "@gharibo/shared";

interface TrainingExampleDialogProps {
  message: ConversationMessage;
  conversation: ConversationWithMessages;
  onClose: () => void;
  onSaved: () => void;
}

export function TrainingExampleDialog({
  message,
  conversation,
  onClose,
  onSaved,
}: TrainingExampleDialogProps) {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [approvedResponse, setApprovedResponse] = useState("");
  const [tags, setTags] = useState("");
  const [domain, setDomain] = useState("");
  const [language, setLanguage] = useState("en");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Find the user message that preceded this assistant message
    const messages = conversation.messages;
    const idx = messages.findIndex((m) => m.id === message.id);
    const userMessage = idx > 0 ? messages[idx - 1] : null;

    setPrompt(userMessage?.content || "");
    setSystemPrompt(conversation.systemPrompt || "");
    setResponse(message.content);
    setApprovedResponse(message.content);
  }, [message, conversation]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/training-examples", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          systemPrompt: systemPrompt || null,
          response,
          approvedResponse: approvedResponse !== response ? approvedResponse : null,
          modelId: conversation.modelId,
          providerId: conversation.providerId,
          tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
          domain: domain || null,
          language: language || null,
          sourceConversationId: conversation.id,
          sourceMessageId: message.id,
        }),
      });
      const json = await res.json();
      if (json.code === 0) {
        toast({ title: "Saved to dataset", variant: "success" });
        onSaved();
      } else {
        toast({
          title: "Failed to save",
          description: json.message,
          variant: "destructive",
        });
      }
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add to Training Dataset</DialogTitle>
          <DialogDescription>
            Save this exchange as a training example. Edit the approved response if needed.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="prompt">Prompt (User Message)</Label>
            <Textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="min-h-[60px]"
            />
          </div>

          {systemPrompt && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sys-prompt">System Prompt</Label>
              <Textarea
                id="sys-prompt"
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                className="min-h-[40px]"
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="response">Original Response</Label>
            <Textarea
              id="response"
              value={response}
              readOnly
              className="min-h-[60px] bg-muted"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="approved">Approved Response (editable)</Label>
            <Textarea
              id="approved"
              value={approvedResponse}
              onChange={(e) => setApprovedResponse(e.target.value)}
              className="min-h-[80px]"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tags">Tags (comma-separated)</Label>
              <Input
                id="tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="reasoning, coding"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="domain">Domain</Label>
              <Input
                id="domain"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="general"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="language">Language</Label>
              <Input
                id="language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !prompt || !approvedResponse}>
            {saving ? "Saving..." : "Save to Dataset"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
