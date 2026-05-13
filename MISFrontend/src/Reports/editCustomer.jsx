import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
    fetchCustomerGroups,
    fetchCustomerById,
    updateCustomer,
} from '../services/customerService.js';
import { useParams } from "react-router-dom";

const getFyStartDate = () => {
    const now = new Date();
    const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return `${year}-04-01`;
};

export default function EditCustomer({ customerId, closeModal }) {
    const { id } = useParams();
    const [groupOptions, setGroupOptions] = useState([]);
    const [values, setValues] = useState({
        Customer_name: '',
        Mobile_number: '',
        Email: '',
        Customer_group: '',
        Status: 'active',
        Tags: [],
        PartyRoles: ['customer'],
        LastInteraction: ''
    });
    const [hasOpeningBalance, setHasOpeningBalance] = useState(false);
    const [openingBalance, setOpeningBalance] = useState('');
    const [openingBalanceType, setOpeningBalanceType] = useState('debit');
    const [openingBalanceDate, setOpeningBalanceDate] = useState(getFyStartDate());

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
                            Email: customer.Email || '',
                            Customer_group: customer.Customer_group || '',
                            Status: customer.Status || 'active',
                            Tags: customer.Tags || [],
                            PartyRoles: Array.isArray(customer.PartyRoles) && customer.PartyRoles.length
                                ? customer.PartyRoles
                                : ['customer'],
                            LastInteraction: customer.LastInteraction || ''
                        });
                        const ob = Number(customer.Opening_balance) || 0;
                        if (ob > 0) {
                            setHasOpeningBalance(true);
                            setOpeningBalance(String(ob));
                            setOpeningBalanceType(customer.Opening_balance_type || 'debit');
                            const obDate = customer.Opening_balance_date
                                ? new Date(customer.Opening_balance_date).toISOString().slice(0, 10)
                                : getFyStartDate();
                            setOpeningBalanceDate(obDate);
                        }
                    }
                })
                .catch(err => console.error('Error fetching customer data:', err));
        }
    }, [customerId]);

    const handleRoleToggle = (role) => {
        setValues((prev) => {
            const exists = prev.PartyRoles.includes(role);
            const next = exists
                ? prev.PartyRoles.filter((r) => r !== role)
                : [...prev.PartyRoles, role];
            return { ...prev, PartyRoles: next.length ? next : ['customer'] };
        });
    };

    const handleSaveChanges = (e) => {
        e.preventDefault();

        if (!values.Customer_name || !values.Customer_group) {
            return;
        }

        const payload = {
            ...values,
            Tags: [...new Set([...(values.Tags || []), ...(values.PartyRoles || [])])],
            Opening_balance: hasOpeningBalance && openingBalance && Number(openingBalance) > 0
                ? Number(openingBalance)
                : 0,
            Opening_balance_type: openingBalanceType,
            Opening_balance_date: hasOpeningBalance && openingBalanceDate ? openingBalanceDate : null,
        };

        updateCustomer(customerId, payload)
            .then(res => {
                if (res.data.success) {
                    toast.success('Customer updated successfully!');
                    closeModal();
                }
            })
            .catch(err => {
                console.error('Error updating customer:', err);
                toast.error('Failed to update customer.');
            });
    };

    return (
        <div className="flex justify-center items-center bg-[#eae6df] min-h-screen">
            <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
                <h2 className="text-2xl font-semibold text-blue-600 mb-4 text-center">Edit Customer / Party</h2>
                <form onSubmit={handleSaveChanges} className="space-y-4">
                    <div>
                        <label className="block text-gray-700 text-sm mb-1">Customer / Party Name</label>
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
                        <label className="block text-gray-700 text-sm mb-1">Email</label>
                        <input
                            type="email"
                            className="w-full px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={values.Email}
                            onChange={(e) => setValues({ ...values, Email: e.target.value })}
                            placeholder="vendor@example.com"
                        />
                        <small className="text-gray-500">Used to auto-fill recipient when sending emails</small>
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
                        <label className="block text-gray-700 text-sm mb-1">Role</label>
                        <div className="flex gap-4 mt-1">
                            <label className="flex items-center gap-1 text-sm text-gray-700 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={values.PartyRoles.includes('customer')}
                                    onChange={() => handleRoleToggle('customer')}
                                    className="accent-blue-500"
                                />
                                Use as Customer
                            </label>
                            <label className="flex items-center gap-1 text-sm text-gray-700 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={values.PartyRoles.includes('vendor')}
                                    onChange={() => handleRoleToggle('vendor')}
                                    className="accent-blue-500"
                                />
                                Use as Vendor
                            </label>
                        </div>
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
                            onChange={(e) => setValues({ ...values, Tags: e.target.value.split(",").map(t => t.trim()).filter(Boolean) })}
                        />
                        <small className="text-gray-500">Comma separated</small>
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
                    <div>
                        <label className="flex items-center gap-2 text-gray-700 text-sm cursor-pointer">
                            <input
                                type="checkbox"
                                checked={hasOpeningBalance}
                                onChange={(e) => setHasOpeningBalance(e.target.checked)}
                                className="accent-blue-500"
                            />
                            Has Opening Balance
                        </label>
                    </div>
                    {hasOpeningBalance && (
                        <>
                            <div className="flex gap-2">
                                <div className="flex-1">
                                    <label className="block text-gray-700 text-sm mb-1">Opening Balance Amount</label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        className="w-full px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        value={openingBalance}
                                        onChange={(e) => setOpeningBalance(e.target.value)}
                                        placeholder="0.00"
                                    />
                                </div>
                                <div>
                                    <label className="block text-gray-700 text-sm mb-1">Dr / Cr</label>
                                    <select
                                        className="px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        value={openingBalanceType}
                                        onChange={(e) => setOpeningBalanceType(e.target.value)}
                                    >
                                        <option value="debit">Debit (Dr)</option>
                                        <option value="credit">Credit (Cr)</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-gray-700 text-sm mb-1">Opening Balance Date</label>
                                <input
                                    type="date"
                                    className="w-full px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    value={openingBalanceDate}
                                    onChange={(e) => setOpeningBalanceDate(e.target.value)}
                                />
                                <small className="text-gray-500">Defaults to 1 April of current financial year</small>
                            </div>
                        </>
                    )}
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
