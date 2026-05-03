import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../apiClient.js';
import SimpleEntityCreateForm from '../components/forms/SimpleEntityCreateForm';

export default function AddCustGroup() {
  const navigate = useNavigate();
  const [Customer_group, setCustomer_Group] = useState('');

  async function submit(e) {
    e.preventDefault();
    try {
      const res = await axios.post('/api/customergroup/addCustomergroup', {
        Customer_group,
      });

      if (res.data === 'exist') {
        alert('Group already exists');
      } else if (res.data === 'notexist') {
        alert('Group added successfully');
        navigate('/home');
      }
    } catch (error) {
      alert('wrong details');
      console.log(error);
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
