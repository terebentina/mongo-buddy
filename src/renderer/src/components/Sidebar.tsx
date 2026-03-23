import { useCallback, useEffect, useRef } from 'react'
import { useStore } from '../store'
import { ScrollArea } from './ui/scroll-area'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from './ui/collapsible'
import { Button } from './ui/button'
import { Loader } from './Loader'
import { Unplug } from 'lucide-react'

interface SidebarProps {
  width: number
  onResize: (width: number) => void
  onChangeConnection?: () => void
}

export function Sidebar({ width, onResize, onChangeConnection }: SidebarProps): JSX.Element {
  const databases = useStore((s) => s.databases)
  const collections = useStore((s) => s.collections)
  const selectedDb = useStore((s) => s.selectedDb)
  const selectedCollection = useStore((s) => s.selectedCollection)
  const selectDb = useStore((s) => s.selectDb)
  const selectCollection = useStore((s) => s.selectCollection)
  const loading = useStore((s) => s.loading)

  const dragging = useRef(false)

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      dragging.current = true
    },
    []
  )

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent): void => {
      if (!dragging.current) return
      const newWidth = Math.min(Math.max(e.clientX, 150), 500)
      onResize(newWidth)
    }
    const handleMouseUp = (): void => {
      dragging.current = false
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [onResize])

  return (
    <div className="border-r bg-muted/30 flex flex-col relative" style={{ width }}>
      <div className="p-3 font-semibold text-sm border-b flex items-center justify-between">
        Databases
        {onChangeConnection && (
          <button
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            onClick={onChangeConnection}
            title="Change connection"
          >
            <Unplug className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {databases.length === 0 && !loading && (
            <p className="text-xs text-muted-foreground px-2 py-4 text-center">No databases</p>
          )}
          {databases.length === 0 && loading && <Loader className="py-4" />}
          {[...databases].sort((a, b) => a.name.localeCompare(b.name)).map((db) => (
            <Collapsible key={db.name} open={selectedDb === db.name}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full justify-start text-sm font-medium"
                  onClick={() => selectDb(db.name)}
                >
                  {db.name}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="ml-3 space-y-0.5">
                  {collections.length === 0 && loading && <Loader className="py-2" />}
                  {collections.length === 0 && !loading && (
                    <p className="text-xs text-muted-foreground px-2 py-2">No collections</p>
                  )}
                  {[...collections].sort((a, b) => a.name.localeCompare(b.name)).map((coll) => (
                    <Button
                      key={coll.name}
                      variant="ghost"
                      size="sm"
                      className={`w-full justify-between text-xs ${
                        selectedCollection === coll.name ? 'bg-accent' : ''
                      }`}
                      onClick={() => selectCollection(db.name, coll.name)}
                    >
                      <span>{coll.name}</span>
                      {coll.count !== undefined && (
                        <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                          {coll.count.toLocaleString()}
                        </span>
                      )}
                    </Button>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      </ScrollArea>
      <div
        className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 active:bg-primary/40"
        onMouseDown={handleMouseDown}
      />
    </div>
  )
}
