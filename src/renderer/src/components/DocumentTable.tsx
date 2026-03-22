import { useStore } from '../store'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './ui/table'
import { Button } from './ui/button'
import { Loader } from './Loader'

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = typeof value === 'object' ? JSON.stringify(value) : String(value)
  return str.length > 100 ? str.slice(0, 100) + '...' : str
}

interface DocumentTableProps {
  onRowClick?: (doc: Record<string, unknown>) => void
}

export function DocumentTable({ onRowClick }: DocumentTableProps): JSX.Element {
  const docs = useStore((s) => s.docs)
  const totalCount = useStore((s) => s.totalCount)
  const skip = useStore((s) => s.skip)
  const limit = useStore((s) => s.limit)
  const loading = useStore((s) => s.loading)
  const fetchPage = useStore((s) => s.fetchPage)

  const columns = getColumns(docs)
  const currentPage = Math.floor(skip / limit) + 1
  const totalPages = Math.max(1, Math.ceil(totalCount / limit))

  if (loading) {
    return <Loader className="flex-1" />
  }

  if (docs.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        No documents found
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col}>{col}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {docs.map((doc, i) => (
              <TableRow
                key={String(doc._id ?? i)}
                className={`even:bg-muted/30 ${onRowClick ? 'cursor-pointer hover:bg-muted/50' : ''}`}
                onClick={() => onRowClick?.(doc)}
              >
                {columns.map((col) => (
                  <TableCell key={col}>{formatCell(doc[col])}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between px-4 py-2 border-t">
        <Button
          variant="outline"
          size="sm"
          disabled={skip === 0}
          onClick={() => fetchPage(Math.max(0, skip - limit))}
        >
          Previous
        </Button>
        <span className="text-sm text-muted-foreground">
          Page {currentPage} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={skip + limit >= totalCount}
          onClick={() => fetchPage(skip + limit)}
        >
          Next
        </Button>
      </div>
    </div>
  )
}

function getColumns(docs: Record<string, unknown>[]): string[] {
  const keySet = new Set<string>()
  for (const doc of docs.slice(0, 20)) {
    for (const key of Object.keys(doc)) {
      keySet.add(key)
    }
  }
  const keys = Array.from(keySet)
  // Ensure _id is first
  const idIndex = keys.indexOf('_id')
  if (idIndex > 0) {
    keys.splice(idIndex, 1)
    keys.unshift('_id')
  }
  return keys
}
