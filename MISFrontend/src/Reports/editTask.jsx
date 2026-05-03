import React, { useState, useEffect } from 'react';
import { fetchTaskGroups, fetchTaskById, updateTask } from '../services/taskService.js';

export default function EditTask({ taskId, closeModal }) {
    const [groupOptions, setGroupOptions] = useState([]);
    const [values, setValues] = useState({
       Task_name: '',
       Task_group: '',
    });

    useEffect(() => {
        fetchTaskGroups()
            .then(res => {
                if (res.data.success) {
                    const options = res.data.result.map(item => item.Task_group);
                    setGroupOptions(options);
                }
            })
            .catch(err => {
                console.error("Error fetching task group options:", err);
            });
    }, []);

    useEffect(() => {
        if (taskId) {
            fetchTaskById(taskId)
                .then(res => {
                    if (res.data.success) {
                        const task = res.data.result;
                        setValues({
                            Task_name: task.Task_name || '',
                            Task_group: task.Task_group || '',
                        });
                    }
                })
                .catch(err => console.log('Error fetching task data:', err));
        }
    }, [taskId]);

    const handleSaveChanges = (e) => {
        e.preventDefault();

        if (!values.Task_name || !values.Task_group) {
            alert('All fields are required.');
            return;
        }

        updateTask(taskId, {
            Task_name: values.Task_name,
            Task_group: values.Task_group,
        })
        .then(res => {
            if (res.data.success) {
                alert('Task updated successfully!');
                closeModal(); 
            }
        })
        .catch(err => {
            console.log('Error updating task:', err);
        });
    };

    return (
        <div className="bg-white-100">
            <h2 className="text-xl font-bold mb-4">Edit Task</h2>
            <form onSubmit={handleSaveChanges}>
            <div className="self-start bg-white p-2 w-100 mb-2 rounded-lg">
                <label>Task Name</label> 
                <br></br>
                <input
                    type="text"
                    value={values.Task_name}
                    onChange={(e) => setValues({ ...values, Task_name: e.target.value })}
                    required
                />
                 <br></br>
                <label>Task Group</label>
                <br></br>
                <select
                    value={values.Task_group}
                    onChange={(e) => setValues({ ...values, Task_group: e.target.value })}
                    required
                >
                    {groupOptions.map((group, index) => (
                        <option key={index} value={group}>
                            {group}
                        </option>
                    ))}
                </select>
                <br></br>
                <button type="submit" className="btn btn-primary">Save Changes</button>
                    <br></br>
                    <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
                </div>
            </form>
        </div>
    );
}
