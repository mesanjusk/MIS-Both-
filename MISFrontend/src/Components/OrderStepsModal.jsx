import React, { useState, useEffect } from "react";
import axios from '../apiClient.js';
import StepDetailsModal from "./StepDetailsModal";
import { useNavigate } from "react-router-dom";
import Vendor from "../Pages/vendor";

export default function OrderStepsModal({ order, onClose }) {
  const navigate = useNavigate();
  const [steps, setSteps] = useState([]);
  const [userMap, setUserMap] = useState({});
  const [paymentOptions, setPaymentOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailIndex, setDetailIndex] = useState(null);
  const [showVendorModal, setShowVendorModal] = useState(false);


  useEffect(() => {
    async function fetchData() {
      try {
        const [taskRes, userRes, customerRes, stepRes] = await Promise.all([
  axios.get("/api/taskgroup/GetTaskgroupList"),
  axios.get("/api/users/GetUserList"),
  axios.get("/api/customers/GetCustomersList"),
  order?.Steps?.length
    ? Promise.resolve({ data: { steps: order.Steps } })
    : order?.Order_Id
    ? axios.get(`/order/getStepsByOrderId/${order.Order_Id}`)
    : Promise.resolve({ data: { steps: [] } }),
]);


        // Filter Task Groups by ID === 1
        const filteredGroups = taskRes.data.result.filter((t) => t.Id === 1);
        const taskNames = filteredGroups.map((t) => t.Task_group);

        // Map users allowed for each group
        const groupMap = {};
        userRes.data.result.forEach((u) => {
          u.Allowed_Task_Groups?.forEach((group) => {
            if (!groupMap[group]) groupMap[group] = [];
            groupMap[group].push(u.User_name);
          });
        });

        const payModes = customerRes.data.result
          .filter((c) => c.Customer_group === "Bank and Account")
          .map((c) => c.Customer_name);

       let stepsList = [];

const savedSteps = stepRes.data?.steps || [];

if (savedSteps.length > 0) {
  // Only show the saved steps
  stepsList = savedSteps.map((s) => ({
    selected: true,
    name: s.label || s.name,
    assignedTo: s.assignedTo || "",
    completed: s.completed || false,
    charge: s.charge || "",
    paymentStatus: s.paymentStatus || "Balance",
    paymentMode: s.paymentMode || "",
    ...s,
  }));
} else {
  // Show default list if nothing is saved yet
  stepsList = filteredGroups.map((item) => ({
    name: item.Task_group,
    selected: true,
    assignedTo: "",
    completed: false,
    charge: "",
    paymentStatus: "Balance",
    paymentMode: "",
  }));
}


        setSteps(stepsList);
        setUserMap(groupMap);
        setPaymentOptions(payModes);
      } catch (err) {
        console.error("Error loading modal data", err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [order]);

  const handleChange = (index, field, value) => {
    const updated = [...steps];
    updated[index][field] = value;
    setSteps(updated);
  };

  const openDetailModal = (index) => {
    setDetailIndex(index);
  };

  const closeDetailModal = () => {
    setDetailIndex(null);
  };

  const handleDetailSave = (updatedStep) => {
    const updated = [...steps];
    updated[detailIndex] = updatedStep;
    setSteps(updated);
    setDetailIndex(null);
  };

  const handleSave = async () => {
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (step.completed && !step.assignedTo) {
        alert(`Please assign a user for step ${i + 1} before saving.`);
        return;
      }
      if (step.completed && step.paymentStatus === "Paid" && !step.paymentMode) {
        alert(`Please select a payment mode for step ${i + 1}.`);
        return;
      }
    }

    const payload = {
      orderId: order?.Order_Id,
      steps: steps.filter((s) => s.selected),
    };

    try {
      const res = await axios.post("/order/updateOrderSteps", payload);
      if (res.data.success) {
        alert("Steps saved successfully.");
        onClose();
      } else {
        alert("Failed to save steps.");
      }
    } catch (err) {
      console.error(err);
      alert("Error occurred while saving.");
    }
  };

  if (loading) {
    return (
      <div className="modal-overlay fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50">
        <div className="bg-white p-6 rounded-lg">Loading...</div>
      </div>
    );
  }

  return (
    <>
      <div className="modal-overlay fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50">
        <div className="bg-white p-4 rounded-lg w-full max-w-xl max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">
              Order #{order?.Order_Number} Steps
            </h2>
            <button onClick={onClose} className="text-gray-500 hover:text-red-500">
              X
            </button>
          </div>

          <div className="space-y-4">
            {steps.map((step, idx) => (
              <div key={idx} className="border rounded p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-medium">
                    {idx + 1}. {step.name}
                  </div>
                  <input
                    type="checkbox"
                    className="h-4 w-4 text-[#25d366] focus:ring-[#25d366] border-gray-300 rounded"
                    checked={!!step.selected}
                    onChange={(e) => handleChange(idx, "selected", e.target.checked)}
                  />
                </div>

                {/* Assigned To */}
                <select
                  className="w-full p-2 border rounded"
                  value={step.assignedTo}
                  onChange={(e) => handleChange(idx, "assignedTo", e.target.value)}
                >
                  <option value="">Assign User</option>
                  {(userMap[step.name] || []).map((user, i) => (
                    <option key={i} value={user}>
                      {user}
                    </option>
                  ))}
                </select>

                <div className="flex justify-end">
               <button
  className="bg-blue-500 text-white px-3 py-1 rounded"
  onClick={() => {
    if (step.completed || step.charge || step.paymentMode) {
      openDetailModal(idx);
    } else {
      if (typeof showVendorModal === "function") {
        showVendorModal();
      } else {
        navigate("/addVendor");
      }
    }
  }}
>
  {step.completed || step.charge || step.paymentMode ? "Edit" : "Add"}
</button>


                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-3 mt-4">
            <button
              onClick={handleSave}
              className="bg-blue-600 text-white w-full py-2 rounded"
            >
              Save
            </button>
            <button
              onClick={onClose}
              className="bg-gray-400 text-white w-full py-2 rounded"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>

      {detailIndex !== null && (
        <StepDetailsModal
          step={steps[detailIndex]}
          onSave={handleDetailSave}
          onClose={closeDetailModal}
          paymentOptions={paymentOptions}
        />
      )}
      {showVendorModal && <Vendor onClose={() => setShowVendorModal(false)} />}

    </>
  );
}
