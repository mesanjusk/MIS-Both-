import axios from '../apiClient.js';

const base = '/api/workflow-templates';
const unwrap = (r) => r?.data?.result ?? r?.data ?? {};

export const fetchWorkflowTemplates = async () => {
  const r = await axios.get(base);
  return unwrap(r);
};

export const createWorkflowTemplate = async (payload) => unwrap(await axios.post(base, payload));

export const updateWorkflowTemplate = async (id, payload) => unwrap(await axios.put(`${base}/${id}`, payload));

export const deleteWorkflowTemplate = async (id) => unwrap(await axios.delete(`${base}/${id}`));

export const applyWorkflowToOrder = async (orderUuid, itemNames) =>
  unwrap(await axios.post(`${base}/apply`, { orderUuid, itemNames }));

export const completeWorkflowStep = async (orderUuid, stepId) =>
  unwrap(await axios.patch(`${base}/orders/${orderUuid}/steps/${stepId}/done`));
