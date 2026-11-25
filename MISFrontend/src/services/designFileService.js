import axios from '../apiClient';

export const scanDesignFiles = (force = false) =>
  axios.get('/api/design-files/scan', force ? { cache: false } : {});

export const assignDesignFile = (file, assigneeId, assignedBy) =>
  axios.post('/api/design-files/assign', {
    fileId: file.fileId,
    fileName: file.fileName,
    orderUuid: file.orderUuid || null,
    orderNumber: file.orderNumber ?? null,
    assigneeId,
    assignedBy,
  });

export const moveDesignFileOrderToPrint = (file, assigneeId) =>
  axios.post('/api/design-files/move-to-print', {
    fileId: file.fileId,
    fileName: file.fileName,
    orderUuid: file.orderUuid,
    orderNumber: file.orderNumber,
    assigneeId,
  });
