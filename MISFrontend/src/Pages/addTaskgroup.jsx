import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../apiClient.js';
import toast from 'react-hot-toast';
import SimpleEntityCreateForm from '../Components/forms/SimpleEntityCreateForm';

export default function AddCustGroup() {
  const navigate = useNavigate();
  const [Task_group, setTask_Group] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await axios.post('/api/taskgroup/addTaskgroup', { Task_group });
      toast.success('Group added successfully');
      navigate('/home');
    } catch (error) {
      if (error.response?.status === 409) {
        toast.error('Group already exists');
      } else {
        toast.error(error.response?.data?.message || 'Error saving group');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SimpleEntityCreateForm
      title="Add Task Group"
      label="Task Group"
      value={Task_group}
      placeholder="Task Group"
      onChange={setTask_Group}
      onSubmit={submit}
      submitLabel="Submit"
      busy={submitting}
    />
  );
}
