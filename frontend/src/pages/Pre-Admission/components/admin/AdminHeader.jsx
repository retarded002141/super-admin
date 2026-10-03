import React, { useState, useEffect } from "react";
import api from "../../services/api";

export default function AdminHeader({ title, subtitle }) {
  const [activeYear, setActiveYear] = useState("");

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const settingsRes = await api.get('/public/settings');
        const archiveYear = sessionStorage.getItem("archiveViewYear");
        const currentViewYear = archiveYear || settingsRes.data.schoolYear;
        setActiveYear(currentViewYear);
      } catch (error) {
        console.error("Failed to fetch settings for header", error);
      }
    };
    fetchSettings();
  }, []);

  return (
    <div className="bg-white flex justify-between items-center mb-2 -mt-4 -mx-6 px-6 py-4 border-b border-gray-200">
      <div>
        <h2 className="text-xl font-bold text-[#0f172a] tracking-tight">{title}</h2>
        {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
      </div>
      {activeYear && (
        <div className="bg-gray-50 border border-gray-200 px-3 py-1 rounded-md shadow-sm">
          <span className="text-sm font-bold text-[#2e522a]">A.Y. {activeYear}</span>
        </div>
      )}
    </div>
  );
}
