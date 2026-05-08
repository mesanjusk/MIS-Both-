import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../apiClient.js';
import toast from 'react-hot-toast';
import SimpleEntityCreateForm from '../Components/forms/SimpleEntityCreateForm';

export default function AddCustGroup() {
  const navigate = useNavigate();
  const [User_group, setUser_Group] = useState('');

  async function submit(e) {
    e.preventDefault();
    try {
      await axios.post('/api/usergroup/addUsergroup', { User_group });
      toast.success('Group added successfully');
      navigate('/home');
    } catch (error) {
      if (error.response?.status === 409) {
        toast.error('Group already exists');
      } else {
        toast.error(error.response?.data?.message || 'Error saving group');
      }
    }
  }

  return (
    <SimpleEntityCreateForm
      title="Add User Group"
      label="User Group"
      value={User_group}
      placeholder="User Group"
      onChange={setUser_Group}
      onSubmit={submit}
      submitLabel="Submit"
    />
  );
}
