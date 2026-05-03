import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from '../apiClient.js';
import CallUpdate from "../Pages/callUpdate";

export default function CallLogs() {
    const navigate = useNavigate();
    const [date, setDate] = useState("");
    const [logs, setLogs] = useState([]);  
    const [selectedCallId, setSelectedCallId] = useState(null);
    const [showCallModal, setShowCallModal] = useState(false);
    const [showForm, setShowForm] = useState(true);

    const [currentPage, setCurrentPage] = useState(1);
    const recordsPerPage = 10; 

    async function submit(e) {
        e.preventDefault();
        try {
            const timestamp = new Date(date).getTime();

            const response = await axios.post("https://contacts.btgondia.com/logs/userLogs",
                {
                    user_uuid: "07590d24-8dae-4f5e-91e2-c5f725cb8648",
                    user_mobile: "+919372633633",
                    date: timestamp,
                    page: 0
                },
                {
                    headers: { "Content-Type": "application/json" }
                }
            );

            console.log("API Response:", response.data);

            if (response.data.success) {
                setLogs(response.data.logs);
                setCurrentPage(1); 
                setShowForm(false);
            } else {
                alert("Failed to fetch logs.");
            }
        } catch (error) {
            console.error("API Error:", error);
            alert("Error fetching call logs. Check console for details.");
        }
    }

    const closeModal = () => {
        navigate("/home");
    };

    const handleCallClick = (log) => {
        setSelectedCallId(log);
        setShowCallModal(true);
    };

    const closeCallModal = () => {
        setShowCallModal(false); 
        setSelectedCallId(null);  
    };

    const indexOfLastRecord = currentPage * recordsPerPage;
    const indexOfFirstRecord = indexOfLastRecord - recordsPerPage;
    const currentRecords = logs.slice(indexOfFirstRecord, indexOfLastRecord);

    return (
        <>
            <div className="d-flex justify-content-center align-items-center bg-secondary vh-100">
                <div className="bg-white p-3 rounded w-90">
                <h2 className="text-xl font-bold">Call Logs</h2>
                    {showForm && (
                        <form onSubmit={submit}>
                            <div className="mb-3">
                                <label htmlFor="date"><strong>Date</strong></label>
                                <input
                                    type="date"
                                    autoComplete="off"
                                    onChange={(e) => setDate(e.target.value)}
                                    placeholder="Date"
                                    className="form-control rounded-0"
                                    required
                                />
                            </div>

                            <button type="submit" className="btn bg-blue-500 w-100 text-white rounded-0">
                                Submit
                            </button>
                            <button type="button" className="btn bg-red-500 w-100 text-white rounded-0" onClick={closeModal}>
                                Close
                            </button>
                        </form>
                    )}

                    {logs.length > 0 && (
                        <div className="mt-4">
                              <button type="button" onClick={closeModal}>X</button>
                              
                            <table className="table table-bordered">
                                <thead>
                                    <tr>
                                        <th>Cached Name</th>
                                        <th>Caller ID</th>
                                        <th>Type</th>
                                        <th>Duration</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {currentRecords.map((log, index) => (
                                        <tr key={index} onClick={() => handleCallClick(log)}>
                                            <td>{log.cachedName}</td>
                                            <td>{log.callerId}</td>
                                            <td>{log.type}</td>
                                            <td>{log.duration}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            <div className="d-flex justify-content-between mt-3">
                                <button 
                                    className="btn btn-primary" 
                                    onClick={() => setCurrentPage(currentPage - 1)} 
                                    disabled={currentPage === 1}
                                >
                                    Previous
                                </button>
                                
                                <span>Page {currentPage}</span>
                                
                                <button 
                                    className="btn btn-primary" 
                                    onClick={() => setCurrentPage(currentPage + 1)} 
                                    disabled={indexOfLastRecord >= logs.length}
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {showCallModal && (
                <div className="modal-overlay fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center">
                    <CallUpdate log={selectedCallId} onClose={closeCallModal} />
                </div>
            )}
        </>
    );
}
