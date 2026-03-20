import { useStore } from '../store'
import { ScrollArea } from './ui/scroll-area'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from './ui/collapsible'
import { Button } from './ui/button'

export function Sidebar(): JSX.Element {
  const databases = useStore((s) => s.databases)
  const collections = useStore((s) => s.collections)
  const selectedDb = useStore((s) => s.selectedDb)
  const selectedCollection = useStore((s) => s.selectedCollection)
  const selectDb = useStore((s) => s.selectDb)
  const selectCollection = useStore((s) => s.selectCollection)

  return (
    <div className="w-60 border-r bg-muted/30 flex flex-col">
      <div className="p-3 font-semibold text-sm border-b">Databases</div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {databases.map((db) => (
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
                  {collections.map((coll) => (
                    <Button
                      key={coll.name}
                      variant="ghost"
                      size="sm"
                      className={`w-full justify-start text-xs ${
                        selectedCollection === coll.name ? 'bg-accent' : ''
                      }`}
                      onClick={() => selectCollection(db.name, coll.name)}
                    >
                      {coll.name}
                    </Button>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
