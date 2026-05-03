import React, { useState, useEffect } from 'react';
import axios from '../apiClient.js';

export default function EditPayment({ paymentId, closeModal }) {

    const [values, setValues] = useState({
        Payment_name: '',
    });

    useEffect(() => {
        if (paymentId) {
            axios.get(`/payment_mode/${paymentId}`)
                .then(res => {
                    if (res.data.success) {
                        const payment = res.data.result;
                        setValues({
                            Payment_name: payment.Payment_name || '',
                        });
                    }
                })
                .catch(err => console.log('Error fetching payment data:', err));
        }
    }, [paymentId]);
    

    const handleSaveChanges = (e) => {
        e.preventDefault();

        if (!values.Payment_name) {
            alert('All fields are required.');
            return;
        }

        axios.put(`/payment_mode/update/${paymentId}`, { 
            Payment_name: values.Payment_name,
        })
        .then(res => {
            if (res.data.success) {
                alert('Payment updated successfully!');
                closeModal(); 
            }
        })
        .catch(err => {
            console.log('Error updating payment:', err);
        });
    };

    return (
        <div className="bg-white-100">
            <h2 className="text-xl font-bold mb-4">Edit Payment</h2>
            <form onSubmit={handleSaveChanges}>
            <div className="self-start bg-white p-2 w-100 mb-2 rounded-lg">
                <label>Payment Name</label> 
                <br></br>
                <input
                    type="text"
                    value={values.Payment_name}
                    onChange={(e) => setValues({ ...values, Payment_name: e.target.value })}
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
