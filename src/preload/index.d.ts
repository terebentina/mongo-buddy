import type { MongoApi } from './index';

export type {
  ConnectionState,
  ConnectedSession,
  OperationKind,
  OperationStatus,
  OperationId,
  OperationParams,
  OperationResult,
  OperationRecord,
  OperationProgress,
} from '../shared/types';

declare global {
  interface Window {
    api: MongoApi;
  }
}
