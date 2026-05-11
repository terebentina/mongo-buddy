import type { z } from 'zod';
import type { OperationKind, OperationParams, OperationProgress, OperationResult, Result } from '../../shared/types';
import type { ActiveConnection } from '../connection-manager';
import type { DialogProviderPort, FilesystemSinkPort, MongoServicePort } from '../operation-registry';

export type ParamsFor<K extends OperationKind> = Extract<OperationParams, { kind: K }>;
export type ResultFor<K extends OperationKind> = Extract<OperationResult, { kind: K }>;

export interface OperationCtx {
  mongo: MongoServicePort;
  fs: FilesystemSinkPort;
  dialog: DialogProviderPort;
  signal: AbortSignal;
  onProgress: (patch: Partial<OperationProgress>) => void;
}

export interface OperationRunSuccess<R> {
  data: R;
  warning?: string;
}

export interface OperationDef<K extends OperationKind> {
  kind: K;
  params: z.ZodType<ParamsFor<K>>;
  run(
    active: ActiveConnection,
    params: ParamsFor<K>,
    ctx: OperationCtx
  ): Promise<Result<OperationRunSuccess<ResultFor<K>>>>;
}

export type AnyOperationDef = {
  [K in OperationKind]: OperationDef<K>;
}[OperationKind];
