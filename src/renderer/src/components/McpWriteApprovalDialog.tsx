import { useEffect, useState } from 'react';
import type { McpWriteApprovalRequest } from '../../../shared/types';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';

export function McpWriteApprovalDialog() {
  const [request, setRequest] = useState<McpWriteApprovalRequest | null>(null);

  useEffect(() => {
    return window.api.onMcpWriteApproval((next) => {
      if ('cleared' in next) {
        setRequest((current) => (current?.id === next.id ? null : current));
      } else {
        setRequest(next);
      }
    });
  }, []);

  const respond = (approve: boolean): void => {
    if (!request) return;
    window.api.respondToMcpWrite(request.id, approve);
    setRequest(null);
  };

  return (
    <Dialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) respond(false);
      }}
    >
      <DialogContent hideClose className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>MCP WRITE approval: {request?.command}</DialogTitle>
          <DialogDescription>
            A remote MCP client requests a one-time MongoDB write. Review the exact input below. Deny unless you
            intended this change.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <p>
            Command: <span className="font-mono">{request?.command}</span>
          </p>
          <p>
            Connection: <span className="font-mono">{request?.connection}</span>
          </p>
          <p>
            Database: <span className="font-mono">{request?.db}</span>
          </p>
          <p>
            Collection: <span className="font-mono">{request?.collection}</span>
          </p>
          <p>Complete EJSON input (untrusted text):</p>
          <pre
            aria-label="Complete EJSON input"
            className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded border p-3 font-mono text-xs"
          >
            {request?.input}
          </pre>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => respond(false)}>
            Deny
          </Button>
          <Button variant="destructive" onClick={() => respond(true)}>
            Approve once
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
