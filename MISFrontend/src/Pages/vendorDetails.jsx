import React, { useEffect, useState } from 'react'; 
import axios from '../apiClient.js'; 
import { useNavigate } from 'react-router-dom';

export default function VendorDetails({ onClose, order }) {
    const [userOptions, setUserOptions] = useState([]); 
    const [tasks, setTasks] = useState([]); 
    const [Amount, setAmount] = useState(0); 
    const [Description, setDescription] = useState(''); 
    const [users, setUsers] = useState(''); 
    const [selectedTaskGroup, setSelectedTaskGroup] = useState(null); 
    const navigate = useNavigate();
    const loggedInUser = "Admin"; 

    useEffect(() => {
        axios.get("/api/taskgroup/GetTaskgroupList")
            .then((res) => {
                if (res.data.success) {
                    const filteredTasks = res.data.result.filter(
                        (task) =>
                            task.Task_group.trim().toLowerCase() !== "delivered" &&
                            task.Task_group.trim().toLowerCase() !== "cancel"
                    );
                    setTasks(filteredTasks);
                } else {
                    setTasks([]);
                }
            })
            .catch((err) => console.error("Error fetching tasks:", err));
    }, []);

    const taskOptions = [...new Set(tasks.map((task) => task.Task_group.trim()))];

    useEffect(() => {
        axios.get("/api/users/GetUserList")
            .then(res => {
                if (res.data.success) {
                    const options = res.data.result.map(item => item.User_name);
                    setUserOptions(options);
                }
            })
            .catch(err => {
                console.error("Error fetching user options:", err);
            });
    }, []);

    const handleTaskGroupChange = (taskGroup) => {
        if (selectedTaskGroup === taskGroup) {
            setSelectedTaskGroup(null); 
        } else {
            setSelectedTaskGroup(taskGroup); 
        }
    };

    async function submit(e) {
        e.preventDefault();
        try {
            if (selectedTaskGroup && Amount && users) {
                const journal = [
                    {
                        Account_id: users,
                        Type: 'Debit',
                        Amount: Number(Amount),
                    },
                    {
                        Account_id: users,
                        Type: 'Credit',
                        Amount: Number(Amount),
                    }
                ];

                const transactionResponse = await axios.post("/api/transaction/addTransaction", {
                    Description: Description,
                    Total_Credit: Number(Amount),
                    Total_Debit: Number(Amount),
                    Payment_mode: users,
                    Journal_entry: journal,
                    Created_by: loggedInUser
                });

                if (!transactionResponse.data.success) {
                    alert("Failed to add Transaction.");
                    return;
                }
            }

            alert("Order added successfully!");
            navigate("/allOrder");

        } catch (e) {
            console.error("Error adding Order or Transaction:", e);
        }
    }

    return (
        <div className="d-flex justify-content-center align-items-center bg-secondary vh-100">
            <div className="bg-white p-3 rounded w-100">
                <button type="button" onClick={onClose}>X</button>
                <h2>Add Vendor</h2>
                <form onSubmit={submit}>
                    <div className="mb-3 flex flex-col gap-2">
                        {taskOptions.map((taskGroup, index) => (
                            <div key={index} className="w-full">
                                <input
                                    type="checkbox"
                                    className="form-check-input me-2"
                                    checked={selectedTaskGroup === taskGroup}
                                    onChange={() => handleTaskGroupChange(taskGroup)}
                                />
                                <label>{taskGroup}</label>
                            </div>
                        ))}
                    </div>

                    {selectedTaskGroup && (
                        <div className="mb-3">
                            <label htmlFor="userSelect"><strong>Users</strong></label>
                            <select
                                id="userSelect"
                                className="form-control"
                                onChange={(e) => setUsers(e.target.value)}
                                value={users}
                            >
                                <option value="">Select User</option>
                                {userOptions.map((option, index) => (
                                    <option key={index} value={option}>{option}</option>
                                ))}
                            </select>

                            <label htmlFor="amount"><strong>Amount</strong></label>
                            <input
                                type="number"
                                id="amount"
                                autoComplete="off"
                                onChange={(e) => setAmount(e.target.value)}
                                value={Amount}
                                placeholder="Enter Amount"
                                className="form-control rounded-0"
                            />

                            <label htmlFor="description"><strong>Description</strong></label>
                            <input
                                type="text"
                                id="description"
                                autoComplete="off"
                                onChange={(e) => setDescription(e.target.value)}
                                value={Description}
                                placeholder="Enter Description"
                                className="form-control rounded-0"
                            />
                        </div>
                    )}

                    <button type="submit" className="w-100 h-10 bg-blue-500 text-white shadow-lg flex items-center justify-center">
                        Submit
                    </button>
                </form>
            </div>
        </div>
    );
}
