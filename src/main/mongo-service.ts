import { MongoClient, ObjectId } from 'mongodb'
// EJSON is not directly exported from mongodb v6; use internal bson re-export
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { EJSON } from 'mongodb/lib/bson'
import type { Result, DbInfo, CollectionInfo, FindOpts, FindResult } from '../shared/types'

export class MongoService {
  private client: MongoClient | null = null

  async connect(uri: string): Promise<Result<undefined>> {
    try {
      this.client = new MongoClient(uri)
      await this.client.connect()
      return { ok: true, data: undefined }
    } catch (err) {
      this.client = null
      return { ok: false, error: (err as Error).message }
    }
  }

  async disconnect(): Promise<Result<undefined>> {
    try {
      await this.client?.close()
      this.client = null
      return { ok: true, data: undefined }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  }

  async listDatabases(): Promise<Result<DbInfo[]>> {
    if (!this.client) return { ok: false, error: 'Not connected' }
    try {
      const result = await this.client.db().admin().listDatabases()
      const databases: DbInfo[] = result.databases.map((db) => ({
        name: db.name,
        sizeOnDisk: db.sizeOnDisk ?? 0,
        empty: db.empty ?? false
      }))
      return { ok: true, data: databases }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  }

  async listCollections(dbName: string): Promise<Result<CollectionInfo[]>> {
    if (!this.client) return { ok: false, error: 'Not connected' }
    try {
      const collections = await this.client.db(dbName).listCollections().toArray()
      const data: CollectionInfo[] = collections.map((c) => ({
        name: c.name,
        type: c.type ?? 'collection'
      }))
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  }

  async find(
    dbName: string,
    collName: string,
    opts: FindOpts
  ): Promise<Result<FindResult>> {
    if (!this.client) return { ok: false, error: 'Not connected' }
    try {
      const collection = this.client.db(dbName).collection(collName)
      const filter = opts.filter ?? {}
      const cursor = collection.find(filter)
      if (opts.sort) cursor.sort(opts.sort)
      if (opts.skip !== undefined) cursor.skip(opts.skip)
      if (opts.limit !== undefined) cursor.limit(opts.limit)

      const [rawDocs, totalCount] = await Promise.all([
        cursor.toArray(),
        collection.countDocuments(filter)
      ])

      // EJSON serialize to handle ObjectId, Date, etc.
      const docs = rawDocs.map(
        (doc) => EJSON.serialize(doc) as Record<string, unknown>
      )

      return { ok: true, data: { docs, totalCount } }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  }

  async aggregate(
    dbName: string,
    collName: string,
    pipeline: Record<string, unknown>[]
  ): Promise<Result<Record<string, unknown>[]>> {
    if (!this.client) return { ok: false, error: 'Not connected' }
    try {
      const collection = this.client.db(dbName).collection(collName)
      const rawDocs = await collection.aggregate(pipeline).toArray()
      const docs = rawDocs.map(
        (doc) => EJSON.serialize(doc) as Record<string, unknown>
      )
      return { ok: true, data: docs }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  }

  async count(
    dbName: string,
    collName: string,
    filter: Record<string, unknown> = {}
  ): Promise<Result<number>> {
    if (!this.client) return { ok: false, error: 'Not connected' }
    try {
      const collection = this.client.db(dbName).collection(collName)
      const count = await collection.countDocuments(filter)
      return { ok: true, data: count }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  }

  async insertOne(
    dbName: string,
    collName: string,
    doc: Record<string, unknown>
  ): Promise<Result<Record<string, unknown>>> {
    if (!this.client) return { ok: false, error: 'Not connected' }
    try {
      const collection = this.client.db(dbName).collection(collName)
      const deserialized = EJSON.deserialize(doc) as Record<string, unknown>
      const result = await collection.insertOne(deserialized)
      const inserted = await collection.findOne({ _id: result.insertedId })
      return { ok: true, data: EJSON.serialize(inserted) as Record<string, unknown> }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  }

  async updateOne(
    dbName: string,
    collName: string,
    id: string,
    doc: Record<string, unknown>
  ): Promise<Result<Record<string, unknown>>> {
    if (!this.client) return { ok: false, error: 'Not connected' }
    try {
      const collection = this.client.db(dbName).collection(collName)
      const deserialized = EJSON.deserialize(doc) as Record<string, unknown>
      const { _id, ...updateFields } = deserialized
      await collection.replaceOne({ _id: new ObjectId(id) }, updateFields)
      const updated = await collection.findOne({ _id: new ObjectId(id) })
      return { ok: true, data: EJSON.serialize(updated) as Record<string, unknown> }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  }

  async deleteOne(
    dbName: string,
    collName: string,
    id: string
  ): Promise<Result<undefined>> {
    if (!this.client) return { ok: false, error: 'Not connected' }
    try {
      const collection = this.client.db(dbName).collection(collName)
      await collection.deleteOne({ _id: new ObjectId(id) })
      return { ok: true, data: undefined }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  }
}
