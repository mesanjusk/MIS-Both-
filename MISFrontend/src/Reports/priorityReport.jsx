import React, { useState, useEffect } from 'react';
import { deletePriority, fetchPriorities } from '../services/priorityService.js';
import EditPriority from './editPriority';
import AddPriority from '../Pages/addPriority';
import { ConfirmModal, EmptyState } from '../Components';

const PriorityReport = () => {
    const [prioritys, setPrioritys] = useState({});
    const [priorityNames, setPriorityNames] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [showEditModal, setShowEditModal] = useState(false); 
    const [selectedPriorityId, setSelectedPriorityId] = useState(null); 
    const [showDeleteModal, setShowDeleteModal] = useState(false); 
    const [selectedPriority, setSelectedPriority] = useState(null); 
    const [showAddModal, setShowAddModal] = useState(false); 
    const [userGroup, setUserGroup] = useState(''); 
    const [deleteErrorMessage, setDeleteErrorMessage] = useState('');

    useEffect(() => {
        const fetchUserGroup = async () => {
            const group = localStorage.getItem("User_group");
            setUserGroup(group);
        };

        fetchUserGroup();

        fetchPriorities()
            .then(res => {
                if (res.data.success) {
                    const priorityMap = res.data.result.reduce((acc, priority) => {
                        if (priority.Priority_uuid && priority.Priority_name) { 
                            acc[priority._id] = {
                                name: priority.Priority_name,
                                priorityUuid: priority.Priority_uuid 
                            };
                        }
                        return acc;
                    }, {});
                    
                    setPrioritys(priorityMap);
                    setPriorityNames(Object.values(priorityMap).map(c => c.name));
                } else {
                    setPrioritys({});
                }
            })
            .catch(err => console.log('Error fetching priority list:', err));
    }, []);
    
    const handleEdit = (priorityId) => {
        setSelectedPriorityId(priorityId); 
        setShowEditModal(true); 
    };

    const handleDeleteClick = (priorityId) => {
        const priorityToDelete = prioritys[priorityId];
        if (priorityToDelete) {
            setSelectedPriority({ ...priorityToDelete, id: priorityId });
            setShowDeleteModal(true);
            setDeleteErrorMessage(''); 
        } else {
            console.error('Priority not found for ID:', priorityId);
        }
    };
    

    const handleDeleteConfirm = () => {
        const priorityId = selectedPriority?.priorityUuid || selectedPriority?.id;
        if (!priorityId) return setShowDeleteModal(false);

        deletePriority(priorityId)
            .then(res => {
            if (res.data.success) {
                setPrioritys(prePriority => {
                    const newPriority = { ...prePriority };
                    delete newPriority[selectedPriority?.id];
                    return newPriority;
                });
            } else {
                console.log('Error deleting priority:', res.data.message);
            }
        })
        .catch(err => console.log('Error deleting priority:', err));
    setShowDeleteModal(false); 
    };
    

    const handleDeleteCancel = () => {
        setShowDeleteModal(false); 
    };

    const handleAddPriority = () => {
        setShowAddModal(true); 
    };

    const handlePrint = () => {
        window.print();
    };

    return (
        <>
            <div className="no-print">
            </div>
            <div className="pt-12 pb-20">
                <div className="d-flex flex-wrap bg-white w-100 max-w-md p-2 mx-auto">
                    <label>
                        Search by priority Name 
                        <input
                            list="priorityNames"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Search by priority name"
                        />
                    </label>
                    <button onClick={handlePrint} className="btn">
                            <svg className="h-8 w-8 text-blue" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 9V3h12v6M6 15h12m-6 0v6m0 0H9m3 0h3" />
                            </svg>
                        </button>
                </div>
                <div className="d-flex flex-wrap bg-white w-100 max-w-md p-2 mx-auto">
                    <button onClick={handleAddPriority} type="button" className="p-3 rounded-full text-white bg-blue-500 mb-3">
                        <svg className="h-8 w-8 text-white-500" width="24" height="24" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round">  
                            <path stroke="none" d="M0 0h24v24H0z"/>  
                            <circle cx="12" cy="12" r="9" />  
                            <line x1="9" y1="12" x2="15" y2="12" />  
                            <line x1="12" y1="9" x2="12" y2="15" />
                        </svg>
                    </button>
                </div>
                <main className="flex flex-1 p-1 overflow-y-auto">
                    <div className="w-100 max-w-md mx-auto">
                        {Object.keys(prioritys).length > 0 ? (
                            <table className="table table-striped">
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        {userGroup === "Admin User" && <th>Actions</th>} 
                                    </tr>
                                </thead>
                                <tbody>
                                    {Object.entries(prioritys)
                                        .filter(([id, priority]) =>
                                            priority.name.toLowerCase().includes(searchTerm.toLowerCase()) 
                                           
                                        )
                                        .map(([id, priority]) => (
                                            <tr key={id}>
                                                <td onClick={() => handleEdit(id)} style={{ cursor: 'pointer' }}>
                                                    {priority.name}
                                                </td>
                                                <td>
                                                    {userGroup === "Admin User" && (
                                                        <button onClick={() => handleDeleteClick(id)} className="btn">
                                                            <svg className="h-6 w-6 text-red-500" width="12" height="12" viewBox="0 0 22 22" strokeWidth="2" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round">  
                                                                <path stroke="none" d="M0 0h24v24H0z"/>  
                                                                <line x1="4" y1="7" x2="20" y2="7" />  
                                                                <line x1="10" y1="11" x2="10" y2="17" />  
                                                                <line x1="14" y1="11" x2="14" y2="17" />  
                                                                <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" />  
                                                                <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />
                                                            </svg>
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                        ) : (
                            <EmptyState message="No data available for the selected filters." />
                        )}
                    </div>
                </main>
            </div>

            {showEditModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <EditPriority priorityId={selectedPriorityId} closeModal={() => setShowEditModal(false)} />
                    </div>
                </div>
            )}

            <ConfirmModal
                isOpen={showDeleteModal}
                title={`Are you sure you want to delete ${selectedPriority?.name}?`}
                message={deleteErrorMessage && <p className="text-red-500">{deleteErrorMessage}</p>}
                onConfirm={handleDeleteConfirm}
                onCancel={handleDeleteCancel}
            />

            {showAddModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <AddPriority closeModal={() => setShowAddModal(false)} /> 
                    </div>
                </div>
            )}

        <div className="no-print">
            </div>
        </>
    );
};

export default PriorityReport;
