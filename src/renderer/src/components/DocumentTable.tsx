import { useState, useEffect, useCallback, useRef } from 'react'
import { useStore } from '../store'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './ui/table'
import { Button } from './ui/button'
import { Loader } from './Loader'

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
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

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({})
  const columnsKey = columns.join(',')
  const prevColumnsKey = useRef(columnsKey)

  useEffect(() => {
    if (prevColumnsKey.current !== columnsKey) {
      setColumnWidths({})
      prevColumnsKey.current = columnsKey
    }
  }, [columnsKey])

  const handleResizeStart = useCallback(
    (col: string, startX: number, startWidth: number) => {
      document.body.style.userSelect = 'none'

      const onMouseMove = (e: MouseEvent): void => {
        const newWidth = Math.max(40, startWidth + e.clientX - startX)
        setColumnWidths((prev) => ({ ...prev, [col]: newWidth }))
      }

      const onMouseUp = (): void => {
        document.body.style.userSelect = ''
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    },
    []
  )

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
        <Table style={{ tableLayout: 'fixed' }}>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              {columns.map((col) => (
                <TableHead
                  key={col}
                  className="whitespace-nowrap pr-6 relative"
                  style={columnWidths[col] ? { width: columnWidths[col] } : undefined}
                >
                  {col}
                  <div
                    className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-border"
                    onMouseDown={(e) => {
                      e.stopPropagation()
                      const th = e.currentTarget.parentElement!
                      handleResizeStart(col, e.clientX, th.offsetWidth)
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                </TableHead>
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
                  <TableCell key={col} className="overflow-visible relative">
                    <span className="block truncate">{formatCell(doc[col])}</span>
                  </TableCell>
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
  const idIndex = keys.indexOf('_id')
  if (idIndex > 0) {
    keys.splice(idIndex, 1)
    keys.unshift('_id')
  }
  return keys
}
