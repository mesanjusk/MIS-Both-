import React, { useState, useEffect } from 'react';
import axios from '../apiClient.js';
import { toast, ToastContainer } from '../Components';

export default function EditUser({ userId, closeModal }) {
    const [groupOptions, setGroupOptions] = useState([]);
    const [taskGroupOptions, setTaskGroupOptions] = useState([]);
    const [values, setValues] = useState({
        User_name: '',
        Mobile_number: '',
        User_group: '',
        Allowed_Task_Groups: [],
    });

    useEffect(() => {
        axios.get("/api/usergroup/GetUsergroupList")
            .then(res => {
                if (res.data.success) {
                    const options = res.data.result.map(item => item.User_group);
                    setGroupOptions(options);
                }
            })
            .catch(err => {
                toast.error("Failed to load user groups");
            });

        axios.get("/api/taskgroup/GetTaskgroupList")
            .then(res => {
                if (res.data.success) {
                    const taskOptions = res.data.result.map(t => t.Task_group);
                    setTaskGroupOptions(taskOptions);
                }
            })
            .catch(err => {
                toast.error("Failed to load task groups");
            });
    }, []);

    useEffect(() => {
        if (userId) {
            axios.get(`/user/${userId}`)
                .then(res => {
                    if (res.data.success) {
                        const user = res.data.result;
                        setValues({
                            User_name: user.User_name || '',
                            Mobile_number: user.Mobile_number || '',
                            User_group: user.User_group || '',
                            Allowed_Task_Groups: user.Allowed_Task_Groups || [],
                        });
                    }
                })
                .catch(err => {
                    toast.error("Failed to load user data");
                });
        }
    }, [userId]);

    const handleTaskGroupChange = (e) => {
        const selected = Array.from(e.target.selectedOptions, option => option.value);
        setValues(prev => ({ ...prev, Allowed_Task_Groups: selected }));
    };

    const handleSaveChanges = async (e) => {
        e.preventDefault();

        const phonePattern = /^[6-9]\d{9}$/;

        if (!values.User_name || !values.Mobile_number || !values.User_group) {
            toast.warning("All fields are required");
            return;
        }

        if (!phonePattern.test(values.Mobile_number)) {
            toast.warning("Enter valid 10-digit mobile number");
            return;
        }

        try {
            const res = await axios.put(`/user/update/${userId}`, {
                User_name: values.User_name,
                Mobile_number: values.Mobile_number,
                User_group: values.User_group,
                Allowed_Task_Groups: values.Allowed_Task_Groups
            });

            if (res.data.success) {
                toast.success("User updated successfully!");
                setTimeout(() => closeModal(), 1500);
            } else {
                toast.error("Update failed");
            }
        } catch (err) {
            console.error(err);
            toast.error("Error updating user");
        }
    };

    return (
        <div className="bg-white-100">
            <ToastContainer position="top-center" />
            <h2 className="text-xl font-bold mb-4">Edit User</h2>
            <form onSubmit={handleSaveChanges}>
                <div className="bg-white p-2 w-100 mb-2 rounded-lg">
                    <label>User Name</label>
                    <input
                        type="text"
                        value={values.User_name}
                        onChange={(e) => setValues({ ...values, User_name: e.target.value })}
                        className="form-control"
                        required
                    />
                    <label className="mt-2">Mobile Number</label>
                    <input
                        type="text"
                        value={values.Mobile_number}
                        onChange={(e) => setValues({ ...values, Mobile_number: e.target.value })}
                        className="form-control"
                        required
                    />
                    <label className="mt-2">User Group</label>
                    <select
                        value={values.User_group}
                        onChange={(e) => setValues({ ...values, User_group: e.target.value })}
                        className="form-control"
                        required
                    >
                        <option value="">Select Group</option>
                        {groupOptions.map((group, index) => (
                            <option key={index} value={group}>{group}</option>
                        ))}
                    </select>
                    <label className="mt-2">Allowed Task Groups</label>
                    <select
                        multiple
                        value={values.Allowed_Task_Groups}
                        onChange={handleTaskGroupChange}
                        className="form-control"
                    >
                        {taskGroupOptions.map((task, i) => (
                            <option key={i} value={task}>{task}</option>
                        ))}
                    </select>
                    <small className="text-muted">Hold Ctrl (Cmd on Mac) to select multiple</small>

                    <button type="submit" className="btn btn-primary mt-3 w-100">Save Changes</button>
                    <button type="button" className="btn btn-secondary mt-2 w-100" onClick={closeModal}>Cancel</button>
                </div>
            </form>
        </div>
    );
}
