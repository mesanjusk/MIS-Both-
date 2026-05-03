import client from '../apiClient';

const FLOWS_ENDPOINT = '/flows';

const normalizeFlowResponse = (response) => response?.data?.data || response?.data || [];

export async function getFlows() {
  const response = await client.get(FLOWS_ENDPOINT);
  return normalizeFlowResponse(response);
}

export async function createFlow(payload) {
  const response = await client.post(FLOWS_ENDPOINT, payload);
  return response?.data?.data || response?.data;
}

export async function updateFlow(flowId, payload) {
  const response = await client.put(`${FLOWS_ENDPOINT}/${flowId}`, payload);
  return response?.data?.data || response?.data;
}

export async function deleteFlow(flowId) {
  const response = await client.delete(`${FLOWS_ENDPOINT}/${flowId}`);
  return response?.data?.data || response?.data;
}
