import axios from '../apiClient.js';

// One combined "who can this task be assigned to" list — in-house employees
// plus freelancers/vendors/contractors, each tagged with `type` and
// `capabilities` so OrderTaskList can filter the big list down to just the
// people who can do the stage a given task is sitting at.
export const fetchAssignees = () => axios.get('/api/assignees');

export const fetchAssigneeReport = (type, id) => axios.get(`/api/assignees/${type}/${id}/report`);
