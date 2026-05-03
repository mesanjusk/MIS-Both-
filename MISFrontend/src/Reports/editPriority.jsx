import React, { useState, useEffect } from 'react';
import { fetchPriorityById, updatePriority } from '../services/priorityService.js';

export default function EditPriority({ priorityId, closeModal }) {

    const [values, setValues] = useState({
        Priority_name: '',
    });

    useEffect(() => {
        if (priorityId) {
            fetchPriorityById(priorityId)
                .then(res => {
                    if (res.data.success) {
                        const priority = res.data.result;
                        setValues({
                            Priority_name: priority.Priority_name || '',
                        });
                    }
                })
                .catch(err => console.log('Error fetching priority data:', err));
        }
    }, [priorityId]);
    

    const handleSaveChanges = (e) => {
        e.preventDefault();

        if (!values.Priority_name) {
            alert('All fields are required.');
            return;
        }

        updatePriority(priorityId, {
            Priority_name: values.Priority_name,
        })
        .then(res => {
            if (res.data.success) {
                alert('Priority updated successfully!');
                closeModal(); 
            }
        })
        .catch(err => {
            console.log('Error updating priority:', err);
        });
    };

    return (
        <div className="bg-white-100">
            <h2 className="text-xl font-bold mb-4">Edit Priority</h2>
            <form onSubmit={handleSaveChanges}>
            <div className="self-start bg-white p-2 w-100 mb-2 rounded-lg">
                <label>Priority Name</label> 
                <br></br>
                <input
                    type="text"
                    value={values.Priority_name}
                    onChange={(e) => setValues({ ...values, Priority_name: e.target.value })}
                    required
                />
                <br></br>
                <button type="submit" className="btn btn-primary">Save Changes</button>
                    <br></br>
                    <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
                </div>
            </form>
        </div>
    );
}
