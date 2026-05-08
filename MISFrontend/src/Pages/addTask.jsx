import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FormControl, InputLabel, MenuItem, Select } from '@mui/material';
import PropTypes from 'prop-types';
import { addTask, fetchTaskGroups } from '../services/taskService.js';
import SimpleEntityCreateForm from '../Components/forms/SimpleEntityCreateForm';

export default function AddTask({ closeModal }) {
  const navigate = useNavigate();
  const [Task_name, setTask_Name] = useState('');
  const [Task_group, setTask_Group] = useState('');
  const [groupOptions, setGroupOptions] = useState([]);

  useEffect(() => {
    fetchTaskGroups()
      .then((res) => {
        if (res.data.success) {
          const options = res.data.result.map((item) => item.Task_group);
          setGroupOptions(options);
        }
      })
      .catch((err) => {
        console.error('Error fetching group options:', err);
      });
  }, []);

  async function submit(e) {
    e.preventDefault();
    try {
      await addTask({ Task_name, Task_group });
      alert('Task added successfully');
      if (closeModal) closeModal();
      navigate('/home');
    } catch (error) {
      if (error.response?.status === 409) {
        alert('Task already exists');
      } else {
        alert(error.response?.data?.message || 'Error saving task');
        console.error(error);
      }
    }
  }

  return (
    <SimpleEntityCreateForm
      title="Add Task"
      label="Task Name"
      value={Task_name}
      placeholder="Task Name"
      onChange={setTask_Name}
      onSubmit={submit}
      submitLabel="Submit"
      onSecondaryAction={closeModal}
      secondaryActionLabel="Close"
    >
      <FormControl fullWidth size="small">
        <InputLabel id="task-group-label">Task Group</InputLabel>
        <Select
          labelId="task-group-label"
          value={Task_group}
          label="Task Group"
          onChange={(e) => setTask_Group(e.target.value)}
        >
          <MenuItem value="">Select Group</MenuItem>
          {groupOptions.map((option) => (
            <MenuItem key={option} value={option}>
              {option}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    </SimpleEntityCreateForm>
  );
}

AddTask.propTypes = {
  closeModal: PropTypes.func,
};

AddTask.defaultProps = {
  closeModal: undefined,
};
