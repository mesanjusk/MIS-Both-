import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../apiClient.js';
import toast from 'react-hot-toast';
import SimpleEntityCreateForm from '../Components/forms/SimpleEntityCreateForm';

export default function AddPriority() {
  const navigate = useNavigate();
  const [Priority_name, setPriority_Name] = useState('');

  async function submit(e) {
    e.preventDefault();
    try {
      await axios.post('/api/priority/addPriority', { Priority_name });
      toast.success('Priority added successfully');
      navigate('/home');
    } catch (error) {
      if (error.response?.status === 409) {
        toast.error('Priority already exists');
      } else {
        toast.error(error.response?.data?.message || 'Error saving priority');
      }
    }
  }

  return (
    <SimpleEntityCreateForm
      title="Add Priority"
      label="Priority Name"
      value={Priority_name}
      placeholder="Priority Name"
      onChange={setPriority_Name}
      onSubmit={submit}
      submitLabel="Submit"
    />
  );
}
