import React, { useState, useEffect } from 'react';
import axios from '../apiClient.js';

export default function EditItem({ itemId, closeModal }) {
    const [groupOptions, setGroupOptions] = useState([]);
    const [values, setValues] = useState({
       Item_name: '',
       Item_group: '',
    });

    useEffect(() => {
        axios.get("/api/itemgroup/GetItemgroupList")
            .then(res => {
                if (res.data.success) {
                    const options = res.data.result.map(item => item.Item_group);
                    setGroupOptions(options);
                }
            })
            .catch(err => {
                console.error("Error fetching item group options:", err);
            });
    }, []);

    useEffect(() => {
        if (itemId) {
            axios.get(`/item/${itemId}`)
                .then(res => {
                    if (res.data.success) {
                        const item = res.data.result;
                        setValues({
                            Item_name: item.Item_name || '',
                            Item_group: item.Item_group || '',
                        });
                    }
                })
                .catch(err => console.log('Error fetching item data:', err));
        }
    }, [itemId]);

    const handleSaveChanges = (e) => {
        e.preventDefault();

        if (!values.Item_name || !values.Item_group) {
            alert('All fields are required.');
            return;
        }

        axios.put(`/item/update/${itemId}`, { 
            Item_name: values.Item_name,
            Item_group: values.Item_group,
        })
        .then(res => {
            if (res.data.success) {
                alert('Item updated successfully!');
                closeModal(); 
            }
        })
        .catch(err => {
            console.log('Error updating item:', err);
        });
    };

    return (
        <div className="bg-white-100">
            <h2 className="text-xl font-bold mb-4">Edit Item</h2>
            <form onSubmit={handleSaveChanges}>
            <div className="self-start bg-white p-2 w-100 mb-2 rounded-lg">
                <label>Item Name</label> 
                <br></br>
                <input
                       type="text"
                        value={values.Item_name}
                      onChange={(e) => setValues({ ...values, Item_name: e.target.value })}
                      required
                />

                 <br></br>
                <label>Item Group</label>
                <br></br>
                <select
                    value={values.Item_group}
                    onChange={(e) => setValues({ ...values, Item_group: e.target.value })}
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
