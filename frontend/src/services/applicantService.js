import api from "./api";

export const getProfile = () => api.get("/applicant/profile");
export const updateProfile = (data) => api.put("/applicant/profile", data);
export const uploadDocuments = (data) => api.post("/applicant/upload", data);