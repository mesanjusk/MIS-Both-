import React, { useState, useEffect } from 'react';
import {
    fetchCustomerGroups,
    fetchCustomerById,
    updateCustomer,
} from '../services/customerService.js';
import { useParams } from "react-router-dom";

export default function EditCustomer({ customerId, closeModal }) {
    const { id } = useParams();
    const [groupOptions, setGroupOptions] = useState([]);
    const [values, setValues] = useState({
        Customer_name: '',
        Mobile_number: '',
        Customer_group: '',
        Status: 'active',
        Tags: [],
        LastInteraction: ''
    });

    useEffect(() => {
        fetchCustomerGroups()
            .then(res => {
                if (res.data.success) {
                    setGroupOptions(res.data.result.map(item => item.Customer_group));
                }
            })
            .catch(err => console.error("Error fetching customer group options:", err));
    }, []);

    useEffect(() => {
        if (customerId) {
            fetchCustomerById(customerId)
                .then(res => {
                    if (res.data.success) {
                        const customer = res.data.result;
                        setValues({
                            Customer_name: customer.Customer_name || '',
                            Mobile_number: customer.Mobile_number || '',
                            Customer_group: customer.Customer_group || '',
                            Status: customer.Status || 'active',
                            Tags: customer.Tags || [],
                            LastInteraction: customer.LastInteraction || ''
                        });
                    }
                })
                .catch(err => console.log('Error fetching customer data:', err));
        }
    }, [customerId]);

    const handleSaveChanges = (e) => {
        e.preventDefault();

        if (!values.Customer_name || !values.Mobile_number || !values.Customer_group) {
            alert('All fields are required.');
            return;
        }

        updateCustomer(customerId, values)
            .then(res => {
                if (res.data.success) {
                    alert('Customer updated successfully!');
                    closeModal();
                }
            })
            .catch(err => console.log('Error updating customer:', err));
    };

    return (
        <div className="flex justify-center items-center bg-[#eae6df] min-h-screen">
            <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
                <h2 className="text-2xl font-semibold text-blue-600 mb-4 text-center">Edit Customer</h2>
                <form onSubmit={handleSaveChanges} className="space-y-4">
                    <div>
                        <label className="block text-gray-700 text-sm mb-1">Customer Name</label>
                        <input
                            type="text"
                            className="w-full px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={values.Customer_name}
                            onChange={(e) => setValues({ ...values, Customer_name: e.target.value })}
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-gray-700 text-sm mb-1">Mobile Number</label>
                        <input
                            type="text"
                            className="w-full px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={values.Mobile_number}
                            onChange={(e) => setValues({ ...values, Mobile_number: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="block text-gray-700 text-sm mb-1">Customer Group</label>
                        <select
                            className="w-full px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={values.Customer_group}
                            onChange={(e) => setValues({ ...values, Customer_group: e.target.value })}
                            required
                        >
                            <option value="" disabled>Select a group</option>
                            {groupOptions.map((group, index) => (
                                <option key={index} value={group}>{group}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-gray-700 text-sm mb-1">Status</label>
                        <select
                            className="w-full px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={values.Status}
                            onChange={(e) => setValues({ ...values, Status: e.target.value })}
                            required
                        >
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-gray-700 text-sm mb-1">Tags</label>
                        <input
                            type="text"
                            className="w-full px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={values.Tags.join(", ")}
                            onChange={(e) => setValues({ ...values, Tags: e.target.value.split(",") })}
                        />
                        <small className="text-gray-500">Enter tags separated by commas</small>
                    </div>
                    <div>
                        <label className="block text-gray-700 text-sm mb-1">Last Interaction</label>
                        <input
                            type="datetime-local"
                            className="w-full px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={values.LastInteraction}
                            onChange={(e) => setValues({ ...values, LastInteraction: e.target.value })}
                        />
                    </div>
                    <div className="flex gap-4 mt-6">
                        <button
                            type="submit"
                            className="w-full bg-blue-500 hover:bg-blue-600 text-white py-2 rounded-lg transition"
                        >
                            Save
                        </button>
                        <button
                            type="button"
                            onClick={closeModal}
                            className="w-full bg-red-500 hover:bg-red-600 text-white py-2 rounded-lg transition"
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
