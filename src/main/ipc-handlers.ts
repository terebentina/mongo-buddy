import { ipcMain } from 'electron'
import type { MongoService } from './mongo-service'
import type { Result, FindOpts } from '../shared/types'

export function registerIpcHandlers(service: MongoService): void {
  const wrap = <T>(fn: (...args: unknown[]) => Promise<Result<T>>) => {
    return async (_event: Electron.IpcMainInvokeEvent, ...args: unknown[]): Promise<Result<T>> => {
      try {
        return await fn(...args)
      } catch (err) {
        return { ok: false, error: (err as Error).message }
      }
    }
  }

  ipcMain.handle('mongo:connect', wrap((uri: unknown) => service.connect(uri as string)))
  ipcMain.handle('mongo:disconnect', wrap(() => service.disconnect()))
  ipcMain.handle('mongo:list-databases', wrap(() => service.listDatabases()))
  ipcMain.handle('mongo:list-collections', wrap((db: unknown) => service.listCollections(db as string)))
  ipcMain.handle(
    'mongo:find',
    wrap((db: unknown, coll: unknown, opts: unknown) =>
      service.find(db as string, coll as string, opts as FindOpts)
    )
  )
  ipcMain.handle(
    'mongo:count',
    wrap((db: unknown, coll: unknown, filter: unknown) =>
      service.count(db as string, coll as string, filter as Record<string, unknown>)
    )
  )
}
