import { dialog } from 'electron';
import type { DialogProviderPort } from '../operation-registry';

export function createDialogProviderAdapter(): DialogProviderPort {
  return {
    async pickSaveFile(suggestedBase: string): Promise<string | null> {
      const { canceled, filePath } = await dialog.showSaveDialog({
        defaultPath: `${suggestedBase}.bson.gz`,
        filters: [{ name: 'BSON Gzip', extensions: ['bson.gz'] }],
      });
      if (canceled || !filePath) return null;
      return filePath;
    },

    async pickFolder(): Promise<string | null> {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openDirectory'],
      });
      if (canceled || filePaths.length === 0) return null;
      return filePaths[0];
    },
  };
}
