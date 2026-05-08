import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../apiClient.js';
import toast from 'react-hot-toast';
import SimpleEntityCreateForm from '../Components/forms/SimpleEntityCreateForm';

export default function AddCustGroup() {
  const navigate = useNavigate();
  const [Customer_group, setCustomer_Group] = useState('');

  async function submit(e) {
    e.preventDefault();
    try {
      await axios.post('/api/customergroup/addCustomergroup', { Customer_group });
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
      title="Add Customer Group"
      label="Customer Group"
      value={Customer_group}
      placeholder="Customer Group"
      onChange={setCustomer_Group}
      onSubmit={submit}
      submitLabel="Submit"
    />
  );
}
