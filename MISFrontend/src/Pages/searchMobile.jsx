import React, { useState, useEffect } from 'react';
import axios from '../apiClient.js';
import EditCustomer from '../Reports/editCustomer';

const SearchMobile = () => {
    const [customers, setCustomers] = useState({});
    const [searchMobile, setSearchMobile] = useState("");
    const [showEditModal, setShowEditModal] = useState(false); 
    const [selectedCustomerId, setSelectedCustomerId] = useState(null); 
    const [userGroup, setUserGroup] = useState(''); 
    const [isLoading, setIsLoading] = useState(true);

    
    useEffect(() => {
        const fetchCustomers = async () => {
            setIsLoading(true);
            try {
                const response = await axios.get("/api/customers/GetCustomersList");
                if (response.data.success) {
                    setCustomers(response.data.result);
                } else {
                    setCustomers([]);
                }
            } catch (error) {
                console.error("Error fetching customers:", error);
                setCustomers([]);
            } finally {
                setIsLoading(false);
            }
        };

        fetchCustomers();
    }, []);

    const filteredCustomers = searchMobile
        ? customers.filter((customer) =>
              String(customer.Mobile_number)
                  ?.toLowerCase()
                  .includes(searchMobile.toLowerCase())
          )
        : [];
    
    const handleEdit = (customerId) => {
        setSelectedCustomerId(customerId); 
        setShowEditModal(true); 
    };

    return (
        <>
            <div className="pt-12 pb-20">
                <div className="d-flex flex-wrap bg-white w-100 max-w-md p-2 mx-auto">
                <input
                            type="text"
                            placeholder="Search by Customer Mobile"
                            className="form-control text-black bg-gray-100 rounded-full"
                            value={searchMobile}
                            onChange={(e) => setSearchMobile(e.target.value)}
                        />
                </div>
                <main className="flex flex-1 p-1 overflow-y-auto">
                    <div className="w-100 max-w-md mx-auto">
                        {isLoading ? (
                                <p className="text-center">Loading...</p>
                            ) : filteredCustomers.length > 0 ? (
                            <table className="table table-striped">
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Mobile</th>
                                        {userGroup === "Admin User" && <th>Actions</th>} 
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredCustomers.map((customer) => (
                                            <tr key={customer._id}>
                                                <td onClick={() => handleEdit(customer._id)} style={{ cursor: 'pointer' }}>
                                                    {customer.Customer_name}
                                                </td>
                                                <td onClick={() => handleEdit(customer._id)} style={{ cursor: 'pointer' }}>
                                                    {customer.Mobile_number}
                                                </td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                        ) : (
                            <p>No data available for the selected filters.</p>
                        )}
                    </div>
                </main>
            </div>

            {showEditModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <EditCustomer customerId={selectedCustomerId} closeModal={() => setShowEditModal(false)} />
                    </div>
                </div>
            )}

        </>
    );
};

export default SearchMobile;
