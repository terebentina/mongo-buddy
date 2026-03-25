import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { useStore } from '../store';
import { toast } from 'sonner';
import { Pencil, Trash2 } from 'lucide-react';

interface ConnectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const AUTH_ERROR_PATTERNS = [/authentication failed/i, /requires authentication/i, /not authorized/i, /bad auth/i];

function isAuthError(message: string): boolean {
  return AUTH_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

function injectCredentials(uri: string, username: string, password: string): string {
  const encodedUser = encodeURIComponent(username);
  const encodedPass = encodeURIComponent(password);
  // Strip existing credentials if present
  const stripped = uri.replace(/^(mongodb(?:\+srv)?:\/\/)[^@]*@/, '$1');
  // Inject new credentials after the scheme
  return stripped.replace(/^(mongodb(?:\+srv)?:\/\/)/, `$1${encodedUser}:${encodedPass}@`);
}

export function ConnectionDialog({ open, onOpenChange }: ConnectionDialogProps): JSX.Element {
  const [uri, setUri] = useState('');
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(false);
  const [showCredentials, setShowCredentials] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pendingUri, setPendingUri] = useState('');
  const [pendingName, setPendingName] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const connected = useStore((s) => s.connected);
  const connect = useStore((s) => s.connect);
  const savedConnections = useStore((s) => s.savedConnections);
  const loadSavedConnections = useStore((s) => s.loadSavedConnections);
  const saveConnection = useStore((s) => s.saveConnection);
  const deleteConnection = useStore((s) => s.deleteConnection);

  const handleOpenChange = (value: boolean): void => {
    if (!value && !connected) return;
    onOpenChange(value);
  };

  useEffect(() => {
    if (open) {
      setUri('');
      setName('');
      setEditing(false);
      setShowCredentials(false);
      setUsername('');
      setPassword('');
      setPendingUri('');
      setPendingName('');
      setAuthError(null);
      loadSavedConnections();
    }
  }, [open, loadSavedConnections]);

  const handleConnect = async (connectUri: string, connectName?: string): Promise<void> => {
    await connect(connectUri);
    const { error } = useStore.getState();
    if (error) {
      if (isAuthError(error)) {
        setShowCredentials(true);
        setPendingUri(connectUri);
        setPendingName(connectName ?? name.trim());
        setAuthError(error);
        setUsername('');
        setPassword('');
      } else {
        toast.error(error);
      }
    } else {
      onOpenChange(false);
    }
  };

  const handleEdit = (conn: { name: string; uri: string }): void => {
    setName(conn.name);
    setUri(conn.uri);
    setEditing(true);
  };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (name.trim()) {
      await saveConnection(name.trim(), uri);
    }
    setEditing(false);
    await handleConnect(uri);
  };

  const handleSavedClick = async (conn: { name: string; uri: string }): Promise<void> => {
    await handleConnect(conn.uri, conn.name);
  };

  const handleCredentialsSubmit = async (): Promise<void> => {
    const credUri = injectCredentials(pendingUri, username, password);
    await connect(credUri);
    const { error } = useStore.getState();
    if (error) {
      if (isAuthError(error)) {
        setAuthError(error);
      } else {
        toast.error(error);
      }
    } else {
      onOpenChange(false);
    }
  };

  const handleDelete = async (connName: string): Promise<void> => {
    await deleteConnection(connName);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        hideClose={!connected}
        onInteractOutside={(e) => {
          if (!connected) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (!connected) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Connect to MongoDB</DialogTitle>
          <DialogDescription>Enter your MongoDB connection URI</DialogDescription>
        </DialogHeader>

        {showCredentials ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleCredentialsSubmit();
            }}
            className="space-y-4"
          >
            {authError && <p className="text-sm text-red-500">{authError}</p>}
            <p className="text-sm text-muted-foreground">Authentication required for {pendingName || pendingUri}</p>
            <Input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
            <Input
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setShowCredentials(false);
                  setUsername('');
                  setPassword('');
                  setAuthError(null);
                }}
              >
                Back
              </Button>
              <Button type="submit" className="flex-1">
                Connect
              </Button>
            </div>
          </form>
        ) : (
          <>
            {savedConnections.length > 0 && (
              <div className="space-y-2" data-testid="saved-connections">
                <p className="text-sm font-medium">Saved Connections</p>
                {savedConnections.map((conn) => (
                  <div key={conn.name} className="flex items-center gap-2">
                    <Button variant="outline" className="flex-1 justify-start" onClick={() => handleSavedClick(conn)}>
                      {conn.name}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(conn)} aria-label={`Edit ${conn.name}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(conn.name)}
                      aria-label={`Delete ${conn.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <Input placeholder="Connection name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
              <Input placeholder="mongodb://localhost:27017" value={uri} onChange={(e) => setUri(e.target.value)} />
              <Button type="submit" className="w-full">
                {editing ? 'Update & Connect' : 'Connect'}
              </Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
