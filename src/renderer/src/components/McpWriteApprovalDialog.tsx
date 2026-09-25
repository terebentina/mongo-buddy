import { useEffect, useState } from 'react';
import type { McpWriteApprovalRequest } from '../../../shared/types';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';

export function McpWriteApprovalDialog() {
  const [request, setRequest] = useState<McpWriteApprovalRequest | null>(null);
  const [typedName, setTypedName] = useState('');

  useEffect(() => {
    return window.api.onMcpWriteApproval((next) => {
      setTypedName('');
      if ('cleared' in next) {
        setRequest((current) => (current?.id === next.id ? null : current));
      } else {
        setRequest(next);
      }
    });
  }, []);

  const respond = (approve: boolean): void => {
    if (!request) return;
    if (request.typeToConfirm !== undefined) {
      window.api.respondToMcpWrite(request.id, approve, typedName);
    } else {
      window.api.respondToMcpWrite(request.id, approve);
    }
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
          {request?.typeToConfirm !== undefined && (
            <div className="space-y-2">
              <p className="text-destructive">
                {request.command === 'deleteMany'
                  ? 'An empty filter may delete all documents in this collection.'
                  : 'This write may permanently affect the entire collection.'}
              </p>
              <label htmlFor="mcp-type-to-confirm">
                Type the exact collection name <span className="font-mono">{request.typeToConfirm}</span> to confirm:
              </label>
              <input
                id="mcp-type-to-confirm"
                className="w-full rounded border p-2 font-mono"
                autoComplete="off"
                value={typedName}
                onChange={(event) => setTypedName(event.target.value)}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => respond(false)}>
            Deny
          </Button>
          <Button
            variant="destructive"
            disabled={request?.typeToConfirm !== undefined && typedName !== request.typeToConfirm}
            onClick={() => respond(true)}
          >
            Approve once
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
